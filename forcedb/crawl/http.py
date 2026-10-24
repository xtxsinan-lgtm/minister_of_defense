from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from typing import Optional

UA = "forcedb/0.1 (+https://github.com/xtxsinan-lgtm/minister_of_defense; research use)"


class Http:
    """礼貌的 HTTP 客户端：固定 UA、超时、有限重试、请求间隔。测试里用 FakeHttp 替换。"""

    def __init__(self, delay: float = 0.5, timeout: float = 40.0, retries: int = 2):
        self.delay, self.timeout, self.retries = delay, timeout, retries
        self._last = 0.0

    def get(self, url: str, params: Optional[dict] = None, accept: str = "*/*") -> bytes:
        if params:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
        wait = self.delay - (time.time() - self._last)
        if wait > 0:
            time.sleep(wait)
        err = None
        for i in range(self.retries + 1):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    self._last = time.time()
                    return r.read()
            except Exception as e:  # noqa: BLE001 —— 网络层统一重试
                err = e
                time.sleep(1.5 * (i + 1))
        raise RuntimeError(f"请求失败：{url}：{err}")

    def get_json(self, url: str, params: Optional[dict] = None):
        return json.loads(self.get(url, params, "application/json"))

    def get_text(self, url: str, params: Optional[dict] = None) -> str:
        return self.get(url, params).decode("utf-8", "replace")
