import json
from typing import Any

import httpx

from app.core.config import get_settings


class DeepSeekClientError(RuntimeError):
    pass


class DeepSeekClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        settings = get_settings()
        self.api_key = api_key if api_key is not None else settings.deepseek_api_key
        self.base_url = (base_url if base_url is not None else settings.deepseek_base_url).rstrip("/")
        self.model = model if model is not None else settings.deepseek_model

    def generate_json(self, messages: list[dict[str, str]], max_tokens: int = 900) -> dict[str, Any]:
        if not self.api_key:
            raise DeepSeekClientError("DEEPSEEK_API_KEY is missing")

        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": messages,
                "temperature": 0.2,
                "max_tokens": max_tokens,
            },
            timeout=18.0,
        )
        response.raise_for_status()
        data = response.json()
        content = _message_content(data)
        return _parse_json_object(content)


def _message_content(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise DeepSeekClientError("DeepSeek response has no choices")

    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise DeepSeekClientError("DeepSeek response has no message")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise DeepSeekClientError("DeepSeek response has empty content")
    return content


def _parse_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.lower().startswith("json"):
            text = text[4:].strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise DeepSeekClientError("DeepSeek content is not JSON") from None
        parsed = json.loads(text[start : end + 1])

    if not isinstance(parsed, dict):
        raise DeepSeekClientError("DeepSeek JSON content is not an object")
    return parsed
