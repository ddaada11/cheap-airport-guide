# -*- coding: utf-8 -*-
"""把 data/shortlist.json 渲染成一张能直接用的 Excel 选品表。"""
import json
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

ROOT = Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "data" / "shortlist.json").read_text(encoding="utf-8"))
rows = data["items"]
stat = data["stat"]

HEAD = Font(bold=True, color="FFFFFF", size=10)
HEAD_FILL = PatternFill("solid", fgColor="1F3864")
TITLE = Font(bold=True, size=14, color="1F3864")
SUB = Font(size=9, color="666666")
GOOD = PatternFill("solid", fgColor="E2EFDA")
WARN = PatternFill("solid", fgColor="FFF2CC")
THIN = Border(*[Side(style="thin", color="D9D9D9")] * 4)

COLS = [
    ("机场名", "name", 16),
    ("最低月付(元)", "minMonthly", 12),
    ("流量(G)", "gb", 9),
    ("每GB成本(元)", "pricePerGb", 13),
    ("周期", "cycle", 8),
    ("优惠码", "coupon", 12),
    ("券后价", "afterCoupon", 9),
    ("线路", "line", 18),
    ("协议", "protocol", 18),
    ("评分", "score", 7),
    ("节点数", "nodes", 8),
    ("试用", "trial", 6),
    ("价格档", "band", 11),
    ("价格来源", "priceSource", 9),
    ("主域名", "host", 32),
    ("邀请码", "code", 14),
    ("是我的码", "isMine", 8),
    ("返佣比例", "rate", 18),
    ("注册链接", "affUrl", 46),
    ("备用域名", "mirrors", 26),
    ("来源数", "srcCount", 7),
]


def sheet(wb, title, items, note=""):
    ws = wb.create_sheet(title)
    ws["A1"] = title
    ws["A1"].font = TITLE
    ws["A2"] = note
    ws["A2"].font = SUB
    r0 = 4
    for c, (label, _k, w) in enumerate(COLS, 1):
        cell = ws.cell(row=r0, column=c, value=label)
        cell.font = HEAD
        cell.fill = HEAD_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.freeze_panes = ws.cell(row=r0 + 1, column=2)
    for i, it in enumerate(items, r0 + 1):
        for c, (_label, key, _w) in enumerate(COLS, 1):
            v = it.get(key)
            if key == "trial":
                v = "是" if v else ""
            elif key == "isMine":
                v = "是" if v else ""
            elif key == "mirrors":
                v = " ".join(v or [])
            elif key == "priceSource":
                v = {"probe": "面板实测", "src": "源观测"}.get(v, "")
            cell = ws.cell(row=i, column=c, value=v)
            cell.border = THIN
            cell.alignment = Alignment(vertical="center")
        # 行底色：能直接推的绿，缺字段的黄
        if it.get("hasPrice") and it.get("hasHost") and it.get("hasCode"):
            for c in range(1, len(COLS) + 1):
                ws.cell(row=i, column=c).fill = GOOD
        elif not it.get("hasPrice"):
            for c in range(1, len(COLS) + 1):
                ws.cell(row=i, column=c).fill = WARN
    if items:
        ref = f"A{r0}:{get_column_letter(len(COLS))}{r0 + len(items)}"
        ws.auto_filter.ref = ref
    return ws


wb = Workbook()
wb.remove(wb.active)

ready = [r for r in rows if r["hasPrice"] and r["hasHost"] and r["hasCode"]]
no_price = [r for r in rows if not r["hasPrice"]]
no_host = [r for r in rows if r["hasPrice"] and not r["hasHost"]]

sheet(
    wb,
    "① 可直接推（价格+域名+邀请码齐全）",
    ready,
    f"{len(ready)} 家。绿底=字段齐全可直接进表格。注意：邀请码列现在填的是别人（同行作者）的码，去 data/my-aff.json 换成自己的才会结算到你账上。",
)
sheet(
    wb,
    "② 待补价格（有域名有码）",
    no_price,
    f"{len(no_price)} 家。有官网域名和邀请码，但所有源都没写价格 —— 跑 npm run probe 让面板自己报，或手工补 1 个月实测。",
)
sheet(wb, "③ 待补域名（有价格没官网）", no_host, f"{len(no_host)} 家。价格有了但抓不到官网域名，需要人工核实。")
sheet(wb, "④ 全部候选", rows, f"共 {len(rows)} 家，含所有来源。按「有价格优先 → 价格升序」排。")

# ── 统计页 ──────────────────────────────────────────────────────────
ws = wb.create_sheet("⑤ 数据概览")
ws["A1"] = "低价机场信息库 · 数据概览"
ws["A1"].font = TITLE
ws["A2"] = f"生成时间 {data['updated'][:19].replace('T', ' ')}"
ws["A2"].font = SUB
r = 4
for k, label in [
    ("total", "候选机场总数"),
    ("withPrice", "有价格"),
    ("withHost", "有官网域名"),
    ("withCode", "有邀请码"),
    ("recommendable", "三者齐全（可直接推）"),
    ("mine", "已换成我的邀请码"),
]:
    ws.cell(row=r, column=1, value=label).font = Font(bold=True)
    ws.cell(row=r, column=2, value=stat.get(k, 0))
    r += 1
r += 1
ws.cell(row=r, column=1, value="价格分层").font = Font(bold=True, size=12, color="1F3864")
r += 1
ws.cell(row=r, column=1, value="档位").font = HEAD
ws.cell(row=r, column=1).fill = HEAD_FILL
ws.cell(row=r, column=2, value="家数").font = HEAD
ws.cell(row=r, column=2).fill = HEAD_FILL
r += 1
for band, n in stat["bands"].items():
    ws.cell(row=r, column=1, value=band)
    ws.cell(row=r, column=2, value=n)
    r += 1
ws.column_dimensions["A"].width = 26
ws.column_dimensions["B"].width = 12

# ── 源清单页 ────────────────────────────────────────────────────────
ws = wb.create_sheet("⑥ 数据源")
ws["A1"] = "采集源清单（每个源的可信度不同，价格冲突时优先信「清单型」和面板实测）"
ws["A1"].font = TITLE
heads = ["源", "类型", "抓到的机场事实", "有效"]
for c, h in enumerate(heads, 1):
    cell = ws.cell(row=3, column=c, value=h)
    cell.font = HEAD
    cell.fill = HEAD_FILL
facts = json.loads((ROOT / "data" / "facts.json").read_text(encoding="utf-8"))
for i, s in enumerate(facts.get("sources", []), 4):
    ws.cell(row=i, column=1, value=s["src"])
    ws.cell(row=i, column=2, value="表格型" if "jichangcha" in s["src"] or "yyds" in s["src"] or "clashmeta" in s["src"] else "长文型")
    ws.cell(row=i, column=3, value=s["rows"])
    ws.cell(row=i, column=4, value=s["useful"])
for col, w in zip("ABCD", [46, 10, 16, 8]):
    ws.column_dimensions[col].width = w

out = ROOT / "data" / "机场选品表.xlsx"
wb.save(out)
print("saved", out, "sheets:", wb.sheetnames)
