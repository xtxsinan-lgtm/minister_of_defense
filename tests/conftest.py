import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(scope="session")
def dbs(tmp_path_factory):
    """在临时目录里重建两个库，测试不依赖仓库里已提交的 .sqlite。"""
    from forcedb.build import build
    d = tmp_path_factory.mktemp("db")
    eq, toe = build(d, verbose=False)
    return eq, toe
