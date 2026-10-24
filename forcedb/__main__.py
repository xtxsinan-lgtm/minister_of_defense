from __future__ import annotations

import argparse
import sys


def main(argv=None):
    ap = argparse.ArgumentParser(prog="forcedb", description="军力量化数据库")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build", help="从源数据确定性重建两个库")
    args = ap.parse_args(argv)
    if args.cmd == "build":
        from .build import build
        build()
    return 0


if __name__ == "__main__":
    sys.exit(main())
