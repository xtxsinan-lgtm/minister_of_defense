#!/usr/bin/env python3
"""生成 docs/forcedb_world_estimates.md：十二国军力估算报告（数字全部来自当前数据库，改了数据重跑即可）。

用法：python3 tools/gen_world_report.py   （先 python3 -m forcedb build）
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from forcedb import db  # noqa: E402
from forcedb.quant import Engine  # noqa: E402
from forcedb.quant.report import DOMAINS, country_notes, world_table  # noqa: E402

WORLD12 = ["RUS", "JPN", "KOR", "PRK", "IRN", "TUR", "GBR", "FRA", "DEU", "GRC", "POL", "ISR"]
AS_OF = {}


def main():
    eq = db.connect(db.DB_DIR / "equipment.sqlite")
    toe = db.connect(db.DB_DIR / "toe.sqlite")
    tab = world_table(eq, toe, WORLD12 + ["CHN"])
    alt = world_table(eq, toe, WORLD12 + ["CHN"], carrier_model="airwing")
    names = {r["iso3"]: r["name_zh"] for r in eq.execute("SELECT iso3, name_zh FROM country")}
    us_total = Engine(eq, toe).run(["USA"])["USA"]["total"]
    cn = tab["CHN"]["mid"]["total"]
    order = sorted(WORLD12, key=lambda c: -tab[c]["mid"]["total"])
    L = []
    w = L.append
    w("# 十二国军力估算（类比法）\n")
    w("> 由 `tools/gen_world_report.py` 根据当前数据库自动生成。方法、数据来源与局限见 [调研计划](forcedb_world_plan.md) 与 [forcedb.md](forcedb.md)。\n")
    w("**口径**：与《2025 中美军事实力对比分析》相同——美国为基准（地面 100 / 投送 100 / 空中 200 / 海上 100，空天按预算比），不含核力量；"
      f"美国总分 {us_total:.1f}，中国 {cn:.1f}（文章口径）。中美数据截至 2025-08，部分国家使用 2026 年 Wikipedia 清单，"
      "日期不完全对齐（已在各国文件的 `as_of` 里标明）。\n")
    w("## 总排名\n")
    w("| 排名 | 国家 | 总分（中） | 低 – 高 | 占美国 | 占中国 | 地面 | 投送 | 空中 | 海上 | 空天 |")
    w("|---|---|---|---|---|---|---|---|---|---|---|")
    for i, c in enumerate(order, 1):
        t, m = tab[c], tab[c]["mid"]
        w(f"| {i} | {names[c]}（{c}） | **{m['total']:.1f}** | {t['low']:.1f} – {t['high']:.1f} | {t['ratio']['mid'] * 100:.1f}% | "
          f"{m['total'] / cn * 100:.1f}% | {m['ground']:.1f} | {m['projection']:.1f} | {m['air']:.1f} | {m['sea']:.1f} | {m['aerospace']:.1f} |")
    w("")
    w("“低/高”：把各国（美国除外）每条库存按置信度整体下调/上调（stated ±5%，estimated ±20%，uncertain ±40%），"
      "只反映**数量**的不确定性，不含类比单位战力本身的误差（见“局限”）。\n")
    w("## 读这张表要注意什么\n")
    w("- 这是**结构性、静态**的存量比较：不含训练、士气、联合作战、情报、盟友支援，也不含核力量。")
    w("- 排名第一的俄罗斯主要来自地面力量（装备数量大但已打折信息化/后勤）和防空营数量；空中力量只有美国的约 11%，海上约 16%。")
    w("- 韩国的地面力量得分高，是因为数量大（约 1800 辆 K1/K2、2200 余门 K9/K55 自行炮、大量火箭炮）而且装备较新；"
      "文章方法对“数量 × 技术乘数”不区分是否有空中优势支持。")
    w("- 英、法、德受限于陆军规模（6–8 万人）而地面得分低，但海空质量高。以色列的特点是空军强、防空体系完整、预备役动员能力强。")
    w("- 朝鲜、伊朗、俄罗斯是置信度最低的三个：数量与可用率缺少独立核实，区间最宽。\n")
    w("## 与另一种航母口径的对比（`--carrier-model airwing`）\n")
    w("| 国家 | 文章口径总分 | 空联模型总分 | 差 |")
    w("|---|---|---|---|")
    for c in order:
        a, b = tab[c]["mid"]["total"], alt[c]["mid"]["total"]
        if abs(a - b) > 0.05:
            w(f"| {names[c]} | {a:.1f} | {b:.1f} | {b - a:+.1f} |")
    w("\n只有拥有航母/准航母且在“作者空中联队模型”里有数据的国家会变化；其余国家不受影响。\n")
    w("## 逐国要点\n")
    for c in order:
        t, m = tab[c], tab[c]["mid"]
        notes = country_notes(toe, c)
        conf = {r[0]: r[1] for r in eq.execute(
            "SELECT confidence, COUNT(*) FROM inventory WHERE country=? GROUP BY 1", (c,))}
        comp = t["components"]
        w(f"### {names[c]}（{c}）—— {m['total']:.1f}（{t['low']:.1f} – {t['high']:.1f}），占美国 {t['ratio']['mid'] * 100:.1f}%\n")
        if notes.get("summary"):
            w(notes["summary"] + "\n")
        if notes.get("caveat"):
            w(f"**注意**：{notes['caveat']}\n")
        gs = comp["ground"]
        parts = {}
        for svc, d in gs.items():
            for k, v in d.items():
                parts[k] = parts.get(k, 0.0) + v
        lab = {"brigades": "旅级战斗单位", "artillery": "炮兵", "air_defense": "防空", "helicopters": "直升机", "special_forces": "特战"}
        w("- 地面构成（原始战力）：" + "，".join(f"{lab[k]} {v:.1f}" for k, v in sorted(parts.items(), key=lambda x: -x[1]) if v > 0.05))
        ab = comp["air_buckets"]
        alab = {"fighter_air": "战斗机制空", "fighter_ground": "战斗机对地", "bomber": "轰炸机", "awacs": "预警机", "tanker": "加油机",
                "uav": "无人机", "electronic_warfare": "电战", "anti_submarine": "反潜", "reconnaissance": "侦察",
                "psychological": "心理战", "command_relay": "指挥中继"}
        w("- 空中构成（等效 F/A-18）：" + "，".join(f"{alab[k]} {v:.0f}" for k, v in sorted(ab.items(), key=lambda x: -x[1]) if v > 1))
        sea = comp["sea"]
        w("- 海上构成（等效垂发）：" + "，".join(f"{k} {v:.0f}" for k, v in sea.items() if v > 1 and k != "total").replace("surface", "水面舰艇").replace("carriers", "航母/两栖舰").replace("submarines", "潜艇"))
        w("- 库存行置信度：" + "，".join(f"{k or '未标'} {v}" for k, v in sorted(conf.items(), key=lambda x: str(x[0]))))
        w(f"- 数据文件：`data/forcedb/countries/{c}.yaml`" + (f"（海军部分由工作簿生成：`generated/{c}_navy.yaml`）" if c in ("RUS", "JPN", "GBR", "FRA", "KOR") else ""))
        w("")
    w("## 方法回顾（每条估算怎么来的）\n")
    w("1. **数量**：作者工作簿（战斗机/舰艇/潜艇，标 `sheet_cn_us_live`）→ Wikipedia 各军种清单（2026 年页面）→ 公开常识量级（标 `estimated`/`uncertain`）。")
    w("2. **单位战力**：新装备用“类比”——指定库内已有装备 + 缩放系数 + 理由（`estimate.analog_of` / `estimate.analog_scale`），或直接取工作簿里该型号的单位值（`estimate.unit_source` 记单元格）。")
    w("3. **陆军**：按装备组成估算——重装备折算成满编班（坦克×2、步战车×1、…）加上下车步兵班，除以美军 IBCT 总战力，再乘装备×机械化×信息化×后勤×准备度乘数（算法同文章“规模/乘数”表）。")
    w("4. **其余域**：炮兵/防空/直升机/特战/火箭军/预警/加油/反潜/运输按类比单位 × 数量；海军水面舰与潜艇直接用工作簿数值或同口径估算。")
    w("5. **区间**：数量按置信度整体上/下浮动；基准国（美国）不动。\n")
    w("## 局限\n")
    w("- 类比与缩放系数是主观判断；其误差（常见 ±30%）未纳入“低/高”。可在 `data/forcedb/countries/*.yaml` 里逐条查看并替换。")
    w("- 没有逐型号技术参数，所以没有用文章的“物理公式重算”路径；若补齐空重/内油/雷达等参数，可改走 recompute 模式。")
    w("- 防空营、炮兵“门数”的口径在各国不统一（营/连/车），已尽量折成与美军同口径，仍有误差。")
    w("- 战时损耗（俄、伊朗）和封存装备翻新（俄、朝）的不确定性远大于一般国家。")
    w("- 乌克兰、印度、巴基斯坦、沙特、澳大利亚等国未在本批范围。库里已有它们的宏观数据（军费/兵力，`forcedb macro`）。")
    out = ROOT / "docs" / "forcedb_world_estimates.md"
    out.write_text("\n".join(L) + "\n", encoding="utf-8")
    print("写入", out.relative_to(ROOT))


if __name__ == "__main__":
    main()
