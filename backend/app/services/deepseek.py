"""DeepSeek chat API client (OpenAI-compatible)."""

import json
from typing import Any, Iterator

import httpx

from app.config import Config

DEFAULT_TIMEOUT = httpx.Timeout(90.0, connect=10.0)
MAX_TOOL_ROUNDS = 6


def is_configured():
    return bool((Config.DEEPSEEK_API_KEY or '').strip())


def _api_url():
    base = (Config.DEEPSEEK_API_BASE or 'https://api.deepseek.com').rstrip('/')
    if base.endswith('/v1'):
        return f'{base}/chat/completions'
    return f'{base}/v1/chat/completions'


def _headers():
    key = (Config.DEEPSEEK_API_KEY or '').strip()
    return {
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
    }


def _model():
    return Config.DEEPSEEK_MODEL or 'deepseek-chat'


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
    key = (Config.DEEPSEEK_API_KEY or '').strip()
    if not key:
        raise RuntimeError(
            'DEEPSEEK_API_KEY is not set. Add it to backend/.env and restart Flask.'
        )

    body: dict[str, Any] = {
        'model': _model(),
        'messages': _build_payload_messages(messages, system_prompt),
        'stream': False,
        'temperature': 0.3,
    }
    if tools:
        body['tools'] = tools
        body['tool_choice'] = 'auto'

    with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
        response = client.post(_api_url(), headers=_headers(), json=body)
        if response.status_code >= 400:
            detail = response.text
            raise RuntimeError(_format_api_error(response.status_code, detail))

        data = response.json()
        choices = data.get('choices') or []
        if not choices:
            raise RuntimeError('DeepSeek returned no choices')

        message = choices[0].get('message') or {}
        return {
            'content': message.get('content') or '',
            'tool_calls': message.get('tool_calls') or [],
            'finish_reason': choices[0].get('finish_reason') or '',
        }


def stream_chat(messages, system_prompt=None) -> Iterator[str]:
    """Yield assistant text deltas from DeepSeek streaming chat."""
    key = (Config.DEEPSEEK_API_KEY or '').strip()
    if not key:
        raise RuntimeError(
            'DEEPSEEK_API_KEY is not set. Add it to backend/.env and restart Flask.'
        )

    body = {
        'model': _model(),
        'messages': _build_payload_messages(messages, system_prompt),
        'stream': True,
        'temperature': 0.3,
    }

    with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
        with client.stream(
            'POST',
            _api_url(),
            headers=_headers(),
            json=body,
        ) as response:
            if response.status_code >= 400:
                detail = response.read().decode('utf-8', errors='replace')
                raise RuntimeError(_format_api_error(response.status_code, detail))

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
                choices = chunk.get('choices') or []
                if not choices:
                    continue
                delta = choices[0].get('delta') or {}
                content = delta.get('content')
                if content:
                    yield content


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
    return f'DeepSeek API error ({status_code}): {message}'
