from __future__ import annotations

import argparse
import sys

from . import db


def _open():
    return (db.connect(db.DB_DIR / "equipment.sqlite"), db.connect(db.DB_DIR / "toe.sqlite"))


def cmd_build(args):
    from .build import build
    build()
    return 0


def cmd_check(args):
    from .check import integrity, stats
    eq, toe = _open()
    for k, v in stats(eq, toe).items():
        print(f"{k:<10}{v}")
    issues = integrity(eq, toe)
    for i in issues:
        print("问题：", i)
    print("通过" if not issues else f"{len(issues)} 个问题")
    return 1 if issues else 0


def cmd_rollup(args):
    eq, toe = _open()
    r = toe.execute("SELECT t.name_zh, t.level, p.personnel, p.complete, p.from_fallback FROM unit_template t "
                    "JOIN rollup_personnel p ON p.template=t.id WHERE t.id=?", (args.template,)).fetchone()
    if r is None:
        print("找不到模板", args.template)
        return 1
    print(f"{args.template}  {r['name_zh']}（{r['level']}）  {r['personnel']} 人"
          + ("" if r["complete"] else "（不完整）") + ("（部分按原文总数回填）" if r["from_fallback"] else ""))
    for x in toe.execute("SELECT category, count FROM rollup_equipment WHERE template=? ORDER BY count DESC", (args.template,)):
        print(f"  {x['category']:<28}{x['count']:g}")
    return 0


def cmd_score(args):
    from .quant import Engine
    eq, toe = _open()
    e = Engine(eq, toe, mode=args.mode, article_compat=False if args.no_compat else None, reference=args.ref, carrier_model=args.carrier_model, scenario=args.scenario)
    r = e.run(args.countries)
    print(r.render())
    for n in e.notes:
        print("·", n)
    if args.mode == "recompute" or args.deviations or args.carrier_model != "article":
        import collections
        by = collections.defaultdict(list)
        for d in r.deviations:
            by[d["item"]].append(d)
        print("\n重算 vs 文章快照（比值 = 重算/快照；偏离大者多为文章里人工调整过）：")
        for k, v in by.items():
            rs = [x["ratio"] for x in v]
            print(f"  {k:<30}n={len(v):<3} min={min(rs):.3f} max={max(rs):.3f}")
        worst = sorted(r.deviations, key=lambda d: -abs(d["ratio"] - 1))[:args.top]
        for d in worst:
            print(f"    {d['item']:<30}{d['equipment']:<24}重算 {d['recomputed']:.3f}  快照 {d['snapshot']:.3f}  比值 {d['ratio']:.2f}")
    return 0


def cmd_coverage(args):
    from .check import coverage
    eq, _ = _open()
    rows, gaps = coverage(eq, args.countries)
    for c in args.countries:
        print(f"== {c}：有库存的类别 ==")
        for rc, dom, cat, models, n, q in rows:
            if rc == c and n:
                print(f"  {dom:<12}{cat:<26}型号 {n:<4}数量 {q:g}")
        print(f"  --- 没有库存数据的类别 {len(gaps[c])} 个（可作为补数据清单）：")
        print("  " + ", ".join(f"{d}/{cat}" for d, cat in gaps[c]))
    return 0


def cmd_crosscheck(args):
    from .check import crosscheck
    eq, _ = _open()
    rows = crosscheck(eq, args.tol)
    if not rows:
        print("没有超过阈值的来源间差异")
    for c, eid, obs, diff in rows[:args.top]:
        det = "  ".join(f"{s}={q:g}({a})" for s, a, q in obs)
        print(f"{diff * 100:5.0f}%  {c}/{eid:<16}{det}")
    print(f"共 {len(rows)} 项差异 ≥ {args.tol * 100:.0f}%")
    return 0


def cmd_macro(args):
    """全球国家宏观底座：最新年份的军费与兵力（来自 country_indicator）。"""
    eq, _ = _open()
    rows = eq.execute(
        "SELECT c.iso3, c.name_zh, "
        "(SELECT MAX(year) FROM country_indicator x WHERE x.country=c.iso3 AND x.indicator='military_expenditure_usd') y, "
        "(SELECT value FROM country_indicator x WHERE x.country=c.iso3 AND x.indicator='military_expenditure_usd' "
        " ORDER BY year DESC LIMIT 1) exp, "
        "(SELECT value FROM country_indicator x WHERE x.country=c.iso3 AND x.indicator='military_expenditure_pct_gdp' "
        " ORDER BY year DESC LIMIT 1) pct, "
        "(SELECT value FROM country_indicator x WHERE x.country=c.iso3 AND x.indicator='armed_forces_personnel' "
        " ORDER BY year DESC LIMIT 1) pers "
        "FROM country c WHERE exp IS NOT NULL ORDER BY exp DESC LIMIT ?", (args.top,)).fetchall()
    if not rows:
        print("还没有宏观数据：先运行  python3 -m forcedb crawl worldbank --apply")
        return 1
    top = rows[0]["exp"]
    print(f"{'国家':<14}{'年':<6}{'军费(十亿美元)':>14}{'占GDP%':>9}{'兵力(万)':>10}{'相对第一':>10}")
    for r in rows:
        print(f"{r['iso3']} {r['name_zh']:<8}{r['y']:<6}{r['exp'] / 1e9:>14.1f}"
              f"{(r['pct'] if r['pct'] is not None else float('nan')):>9.2f}"
              f"{(r['pers'] / 1e4 if r['pers'] is not None else float('nan')):>10.1f}{r['exp'] / top:>10.2f}")
    return 0


def cmd_demand(args):
    """按编制应有的装备数量（旅级单位数 × 模板汇总）。"""
    _, toe = _open()
    for c in args.countries:
        print(f"== {c}：编制内装备需求（只含已映射模板的旅级单位）==")
        for r in toe.execute("SELECT category, count, classes FROM toe_demand WHERE country=? ORDER BY count DESC LIMIT ?",
                             (c, args.top)):
            print(f"  {r['category']:<28}{r['count']:>10g}   （{r['classes']} 类旅）")
    return 0


WORLD12 = ["RUS", "JPN", "KOR", "PRK", "IRN", "TUR", "GBR", "FRA", "DEU", "GRC", "POL", "ISR"]


def cmd_world(args):
    """十二国（或指定国家）军力估算：中/低/高 + 与美、中的比值。"""
    from .quant.report import world_table
    eq, toe = _open()
    countries = args.countries or WORLD12
    tab = world_table(eq, toe, countries + ["CHN"], carrier_model=args.carrier_model)
    rows = sorted(countries, key=lambda c: -tab[c]["mid"]["total"])
    print(f"{'国家':<6}{'总分':>8}{'低':>8}{'高':>8}{'占美%':>8}   地面  投送  空中  海上  空天   （美=522.2，中={tab['CHN']['mid']['total']:.1f}）")
    for c in rows:
        t = tab[c]
        m = t["mid"]
        print(f"{c:<6}{m['total']:>8.1f}{t['low']:>8.1f}{t['high']:>8.1f}{t['ratio']['mid'] * 100:>8.1f}"
              f"{m['ground']:>7.1f}{m['projection']:>6.1f}{m['air']:>6.1f}{m['sea']:>6.1f}{m['aerospace']:>6.1f}")
    return 0


def cmd_crawl(args):
    from .crawl import runner
    return runner.main(args)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="forcedb", description="军力量化数据库")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build", help="从源数据确定性重建两个库").set_defaults(fn=cmd_build)
    sub.add_parser("check", help="统计 + 完整性检查").set_defaults(fn=cmd_check)
    p = sub.add_parser("rollup", help="某个编制模板的人数/装备汇总")
    p.add_argument("template")
    p.set_defaults(fn=cmd_rollup)
    p = sub.add_parser("score", help="量化并输出对比表")
    p.add_argument("--mode", choices=["snapshot", "recompute"], default="snapshot")
    p.add_argument("--countries", nargs="+", default=["CHN", "USA"])
    p.add_argument("--ref", default="USA", help="基准国（归一为 100/200）")
    p.add_argument("--carrier-model", choices=["article", "airwing"], default="article",
                   help="航母口径：文章的出动架次折算 / 作者航母空中联队复合模型")
    p.add_argument("--scenario", choices=["mid", "low", "high"], default="mid",
                   help="不确定性情景：非基准国数量按置信度整体下调/上调")
    p.add_argument("--no-compat", action="store_true", help="不加回表格硬编码总计的差额（逐行自洽口径）")
    p.add_argument("--deviations", action="store_true")
    p.add_argument("--top", type=int, default=10)
    p.set_defaults(fn=cmd_score)
    p = sub.add_parser("coverage", help="各国各类别的数据覆盖率与缺口")
    p.add_argument("--countries", nargs="+", default=["CHN", "USA"])
    p.set_defaults(fn=cmd_coverage)
    p = sub.add_parser("crosscheck", help="不同来源之间库存数量的差异（发现表格/众包数据的出入）")
    p.add_argument("--tol", type=float, default=0.15)
    p.add_argument("--top", type=int, default=30)
    p.set_defaults(fn=cmd_crosscheck)
    p = sub.add_parser("world", help="十二国军力估算（中/低/高）")
    p.add_argument("--countries", nargs="*")
    p.add_argument("--carrier-model", choices=["article", "airwing"], default="article")
    p.set_defaults(fn=cmd_world)
    p = sub.add_parser("demand", help="编制内装备需求（编制库 × 旅级单位数）")
    p.add_argument("--countries", nargs="+", default=["CHN", "USA"])
    p.add_argument("--top", type=int, default=15)
    p.set_defaults(fn=cmd_demand)
    p = sub.add_parser("macro", help="全球军费/兵力排名（来自 worldbank 连接器）")
    p.add_argument("--top", type=int, default=15)
    p.set_defaults(fn=cmd_macro)
    p = sub.add_parser("crawl", help="运行爬取连接器（见 forcedb/crawl）")
    p.add_argument("connector", nargs="?", help="连接器名；省略则列出全部")
    p.add_argument("--apply", action="store_true", help="真正写库；默认 dry-run 只报告变更")
    p.add_argument("--db-dir", default=None)
    p.set_defaults(fn=cmd_crawl)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
