"""NVIDIA NIM chat API client (OpenAI-compatible)."""

import json
import time
from typing import Any, Iterator

import httpx

from app.config import Config

DEFAULT_TIMEOUT = httpx.Timeout(90.0, connect=10.0)
MAX_TOOL_ROUNDS = 6
MAX_ATTEMPTS = 5
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


def is_configured():
    return bool((Config.NVIDIA_API_KEY or '').strip())


def _api_url():
    base = (Config.NVIDIA_API_BASE or 'https://integrate.api.nvidia.com/v1').rstrip('/')
    if base.endswith('/v1'):
        return f'{base}/chat/completions'
    return f'{base}/v1/chat/completions'


def _headers():
    key = (Config.NVIDIA_API_KEY or '').strip()
    return {
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
    }


def model_name():
    return Config.NVIDIA_MODEL or 'nvidia/nemotron-3-super-120b-a12b'


def _build_payload_messages(messages, system_prompt=None):
    payload_messages = []
    if system_prompt:
        payload_messages.append({'role': 'system', 'content': system_prompt})
    payload_messages.extend(messages)
    return payload_messages


def complete_chat(messages, system_prompt=None, tools=None) -> dict[str, Any]:
    """
    Non-streaming completion. Returns assistant message dict:
    { content, tool_calls, finish_reason }.
    """
    key = (Config.NVIDIA_API_KEY or '').strip()
    if not key:
        raise RuntimeError(
            'NVIDIA_API_KEY is not set. Add it to backend/.env and restart Flask.'
        )

    body: dict[str, Any] = {
        'model': model_name(),
        'messages': _build_payload_messages(messages, system_prompt),
        'stream': False,
        'temperature': 0.3,
    }
    if tools:
        body['tools'] = tools
        body['tool_choice'] = 'auto'

    with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
        # NVIDIA's shared endpoint intermittently returns 5xx/429 under load.
        for attempt in range(MAX_ATTEMPTS):
            try:
                response = client.post(_api_url(), headers=_headers(), json=body)
            except httpx.TransportError:
                if attempt == MAX_ATTEMPTS - 1:
                    raise
                time.sleep(1.5 * (attempt + 1))
                continue
            if response.status_code in RETRY_STATUSES and attempt < MAX_ATTEMPTS - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            break
        if response.status_code >= 400:
            detail = response.text
            raise RuntimeError(_format_api_error(response.status_code, detail))

        data = response.json()
        choices = data.get('choices') or []
        if not choices:
            raise RuntimeError('NVIDIA API returned no choices')

        message = choices[0].get('message') or {}
        return {
            'content': message.get('content') or '',
            'tool_calls': message.get('tool_calls') or [],
            'finish_reason': choices[0].get('finish_reason') or '',
        }


class _TransientStreamError(Exception):
    """A 5xx/429 error from NVIDIA, possibly arriving as the first SSE event
    even though the HTTP status line said 200. Safe to retry only if no
    content has been yielded to the caller yet."""


def stream_chat_full(messages, system_prompt=None, tools=None) -> Iterator[dict]:
    """
    Real token-by-token streaming, with tool-call support.

    Yields events as they arrive from NVIDIA:
      {'type': 'token', 'content': str}   -- a piece of the visible answer
    and exactly one final event:
      {'type': 'done', 'content': str, 'tool_calls': list, 'finish_reason': str}

    `content` on the 'done' event is the full answer text (the concatenation
    of every 'token' event already yielded) so the caller doesn't need to
    re-accumulate it. `reasoning_content` deltas (the model's internal
    "thinking") are intentionally never yielded — only the final answer.

    Retries transient 5xx/429 errors, but only before any token has been
    yielded — once real content has reached the caller, a retry would risk
    a garbled duplicate, so a mid-stream error is raised instead.
    """
    key = (Config.NVIDIA_API_KEY or '').strip()
    if not key:
        raise RuntimeError(
            'NVIDIA_API_KEY is not set. Add it to backend/.env and restart Flask.'
        )

    body: dict[str, Any] = {
        'model': model_name(),
        'messages': _build_payload_messages(messages, system_prompt),
        'stream': True,
        'temperature': 0.3,
    }
    if tools:
        body['tools'] = tools
        body['tool_choice'] = 'auto'

    last_error: Exception | None = None

    for attempt in range(MAX_ATTEMPTS):
        started = False
        content_parts: list[str] = []
        tool_calls_by_index: dict[int, dict[str, Any]] = {}
        finish_reason = ''

        try:
            with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
                with client.stream('POST', _api_url(), headers=_headers(), json=body) as response:
                    if response.status_code >= 400:
                        detail = response.read().decode('utf-8', errors='replace')
                        raise _TransientStreamError(
                            _format_api_error(response.status_code, detail)
                        ) if response.status_code in RETRY_STATUSES else RuntimeError(
                            _format_api_error(response.status_code, detail)
                        )

                    for line in response.iter_lines():
                        if not line:
                            continue
                        if line.startswith('data:'):
                            line = line[5:].strip()
                        if line == '[DONE]':
                            break
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        # NVIDIA can send `{"error": {...}}` as the first SSE
                        # event even on an HTTP 200 status line.
                        if 'error' in chunk:
                            err = chunk.get('error') or {}
                            status = err.get('code') or 0
                            message = err.get('message') or str(err)
                            if status in RETRY_STATUSES or not status:
                                raise _TransientStreamError(
                                    f'NVIDIA API error ({status or "?"}): {message}'
                                )
                            raise RuntimeError(f'NVIDIA API error ({status}): {message}')

                        choices = chunk.get('choices') or []
                        if not choices:
                            continue
                        delta = choices[0].get('delta') or {}

                        piece = delta.get('content')
                        if piece:
                            started = True
                            content_parts.append(piece)
                            yield {'type': 'token', 'content': piece}

                        for tc in delta.get('tool_calls') or []:
                            index = tc.get('index', 0)
                            entry = tool_calls_by_index.setdefault(index, {
                                'id': None,
                                'type': 'function',
                                'function': {'name': '', 'arguments': ''},
                            })
                            if tc.get('id'):
                                entry['id'] = tc['id']
                            fn = tc.get('function') or {}
                            if fn.get('name'):
                                entry['function']['name'] += fn['name']
                            if fn.get('arguments'):
                                entry['function']['arguments'] += fn['arguments']

                        fr = choices[0].get('finish_reason')
                        if fr:
                            finish_reason = fr

            tool_calls = [tool_calls_by_index[i] for i in sorted(tool_calls_by_index)]
            yield {
                'type': 'done',
                'content': ''.join(content_parts),
                'tool_calls': tool_calls,
                'finish_reason': finish_reason,
            }
            return

        except _TransientStreamError as exc:
            last_error = exc
            if started:
                raise RuntimeError(str(exc)) from exc
            if attempt < MAX_ATTEMPTS - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise RuntimeError(str(exc)) from exc
        except httpx.TransportError as exc:
            last_error = exc
            if started or attempt == MAX_ATTEMPTS - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
            continue

    if last_error:
        raise RuntimeError(str(last_error))


def _format_api_error(status_code, detail):
    try:
        parsed = json.loads(detail)
        message = parsed.get('error', {})
        if isinstance(message, dict):
            message = message.get('message') or detail
        elif not isinstance(message, str):
            message = detail
    except json.JSONDecodeError:
        message = detail or f'HTTP {status_code}'
    return f'NVIDIA API error ({status_code}): {message}'
