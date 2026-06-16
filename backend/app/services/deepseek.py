"""DeepSeek chat API client (OpenAI-compatible)."""

import json
from typing import Iterator

import httpx

from app.config import Config

DEFAULT_TIMEOUT = httpx.Timeout(60.0, connect=10.0)


def is_configured():
    return bool((Config.DEEPSEEK_API_KEY or '').strip())


def _api_url():
    base = (Config.DEEPSEEK_API_BASE or 'https://api.deepseek.com').rstrip('/')
    if base.endswith('/v1'):
        return f'{base}/chat/completions'
    return f'{base}/v1/chat/completions'


def stream_chat(messages, system_prompt=None) -> Iterator[str]:
    """Yield assistant text deltas from DeepSeek streaming chat."""
    key = (Config.DEEPSEEK_API_KEY or '').strip()
    if not key:
        raise RuntimeError(
            'DEEPSEEK_API_KEY is not set. Add it to backend/.env and restart Flask.'
        )

    payload_messages = []
    if system_prompt:
        payload_messages.append({'role': 'system', 'content': system_prompt})
    payload_messages.extend(messages)

    body = {
        'model': Config.DEEPSEEK_MODEL or 'deepseek-chat',
        'messages': payload_messages,
        'stream': True,
        'temperature': 0.3,
    }

    headers = {
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
    }

    with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
        with client.stream(
            'POST',
            _api_url(),
            headers=headers,
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
        elif isinstance(message, str):
            pass
        else:
            message = detail
    except json.JSONDecodeError:
        message = detail or f'HTTP {status_code}'
    return f'DeepSeek API error ({status_code}): {message}'
