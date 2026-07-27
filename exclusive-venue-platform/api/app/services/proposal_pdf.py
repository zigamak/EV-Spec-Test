# ruff: noqa: E501  — this module is largely an HTML/CSS template string; CSS
# declarations and interpolated markup lines don't wrap meaningfully.
"""Server-side proposal PDF (task G4) — renders the branded document with
Playwright/Chromium, i.e. the SAME engine the operator previews in, so the
downloaded PDF is true to the on-screen design. Cross-platform (works on
Windows dev where WeasyPrint's native GTK/Pango libs don't).

Production note: Render/any Linux host must run `playwright install chromium`
(and its OS deps) in the build step. Chromium is launched per request here
— fine for an occasional download; batch/high-volume would warrant a pooled
browser.
"""

import base64
import html as _html
from functools import lru_cache
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

_LOGO_PATH = Path(__file__).parent / "assets" / "logo-white.png"


@lru_cache(maxsize=1)
def _logo_data_uri() -> str:
    """Base64 data URI for the brand logo — embedded inline so Chromium (run
    headless in a subprocess, no guaranteed dev server) can always resolve it."""
    data = _LOGO_PATH.read_bytes()
    return f"data:image/png;base64,{base64.b64encode(data).decode()}"


def _esc(value: Any) -> str:
    return _html.escape(str(value)) if value is not None else ""


def _money(value: Any) -> str:
    if value is None:
        return "—"
    return f"HKD {float(value):,.0f}"


SERVICE_FEE_PCT = 12  # EVA Service Fee applied to every venue subtotal.


def _headline(text: str) -> str:
    """Render a two-part serif headline with the second half italic-accented
    (matches the reference's '… different story.' styling). Split on the last
    comma so the tail becomes the accent."""
    if "," in text:
        head, tail = text.rsplit(",", 1)
        return f"{_esc(head)},<em> {_esc(tail.strip())}</em>"
    return _esc(text)


def render_proposal_html(ctx: dict[str, Any]) -> str:
    """Build the full branded proposal document from a context dict (see
    routers/proposals.py::_proposal_context). Six sections: cover, the brief,
    the options (image beside details), the investment (itemised + EVA fee),
    a side-by-side comparison, and a closing signed by the owner."""
    money = _money
    venues = ctx["venues"]

    # --- 01 · the brief ---
    brief_tiles = "".join(
        f'<div class="tile"><div class="tk">{_esc(k)}</div><div class="tv">{_esc(v)}</div></div>'
        for k, v in ctx["brief_meta"]
    )
    enquiry_cells = "".join(
        f'<div class="ec"><div class="tk">{_esc(k)}</div><div class="ev">{_esc(v)}</div></div>'
        for k, v in ctx["enquiry_rows"]
    )

    # --- 02 · the options (image beside details) ---
    option_blocks = ""
    for v in venues:
        bullets = "".join(f'<span class="am">◆ {_esc(a)}</span>' for a in v["amenities"])
        img = f'<img src="{_esc(v["image"])}" />' if v.get("image") else ""
        option_blocks += f"""
        <div class="opt">
          <div class="opt-img">{img}<span class="opt-tag">Option · {v['index']:02d}</span></div>
          <div class="opt-body">
            <div class="eyebrow accent">Option · {v['index']:02d}</div>
            <h3>{_esc(v['name'])}</h3>
            <div class="loc">{_esc(v['location_line'])}</div>
            {f'<p class="desc">{_esc(v["description"])}</p>' if v.get("description") else ""}
            <div class="ams">{bullets}</div>
            <div class="fromrow"><span class="from">From</span><span class="fromval serif">{money(v['total'])}</span></div>
          </div>
        </div>"""

    # --- 03 · investment (dark, itemised) ---
    invest_blocks = ""
    for v in venues:
        img = f'<img src="{_esc(v["image"])}" />' if v.get("image") else ""
        invest_blocks += f"""
        <div class="inv">
          <div class="inv-img">{img}</div>
          <div class="inv-body">
            <div class="eyebrow" style="color:#c9a24a">Option · {v['index']:02d}</div>
            <h3 class="serif">{_esc(v['name'])}</h3>
            <div class="inv-meta serif">{_esc(v['meta_line'])}</div>
            <div class="inv-line"><span>Venue rate <em class="serif">{money(v['rate_per_hr'])} / hr</em></span></div>
            <div class="inv-line sub">{_esc(v['hours_label'])}</div>
            <div class="inv-line bold"><span>Venue subtotal</span><span>{money(v['subtotal'])}</span></div>
            <div class="fee">
              <div class="fee-row"><span><strong>EVA Service Fee</strong> · {SERVICE_FEE_PCT}%</span><span>{money(v['fee'])}</span></div>
              <div class="fee-note">Covers venue curation, contract negotiation, on-day production support, vendor coordination.</div>
            </div>
          </div>
          <div class="inv-total"><div class="tk" style="color:#c9a24a">Total</div><div class="serif big">{money(v['total'])}</div></div>
        </div>"""

    # --- side-by-side comparison ---
    compare_cards = ""
    for v in venues:
        pick = f'<span class="pick">◆ {_esc(ctx["owner_first"])}’s pick</span>' if v.get("recommended") else ""
        compare_cards += f"""
        <div class="cmp{' cmp-pick' if v.get('recommended') else ''}">
          {pick}
          <div class="eyebrow" style="color:#c9a24a">Option · {v['index']:02d}</div>
          <h3 class="serif">{_esc(v['name'])}</h3>
          <div class="cmp-loc">{_esc(v['location_line'])}</div>
          <div class="cmp-row"><span>Rate / hr</span><span>{money(v['rate_per_hr'])}</span></div>
          <div class="cmp-row"><span>Hours booked</span><span>{_esc(v['hours'])} hrs</span></div>
          <div class="cmp-row"><span>Venue subtotal</span><span>{money(v['subtotal'])}</span></div>
          <div class="cmp-row fee-i"><span>EVA Service Fee · {SERVICE_FEE_PCT}%</span><span>{money(v['fee'])}</span></div>
          <div class="cmp-total"><span>Total</span><span class="serif">{money(v['total'])}</span></div>
        </div>"""

    return f"""<!doctype html>
<html><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500;1,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {{ --navy:#1b2a4a; --navy2:#22315a; --accent:#a0192d; --gold:#c9a24a; --cream:#f2f0ed;
           --paper:#faf9f6; --ink:#1b2a4a; --muted:#8a8f99; --border:rgba(27,42,74,0.14); }}
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  html {{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
  body {{ font-family:'Inter',sans-serif; color:var(--ink); background:var(--paper); font-size:13px; }}
  .serif {{ font-family:'Cormorant Garamond',serif; }}
  .eyebrow {{ font-size:9px; letter-spacing:2.5px; text-transform:uppercase; font-weight:600; }}
  .accent {{ color:var(--accent); }}
  h1,h2,h3 {{ font-family:'Cormorant Garamond',serif; font-weight:500; }}
  em {{ font-style:italic; }}
  section {{ padding:56px; page-break-inside:avoid; }}
  .head {{ font-size:38px; line-height:1.15; color:var(--navy); margin:10px 0 18px; }}
  .head em {{ color:var(--accent); }}
  .lead {{ color:#5b6474; line-height:1.6; max-width:620px; }}

  /* cover */
  .cover {{ background:var(--navy); color:var(--cream); height:62vh; display:flex;
            flex-direction:column; justify-content:space-between; page-break-after:always; }}
  .logo {{ width:40px; height:auto; margin:0 auto; display:block; }}
  .cover h1 {{ font-size:42px; line-height:1.15; color:#e0a3ad; }}
  .cover .prep {{ font-size:9px; letter-spacing:2.5px; text-transform:uppercase; opacity:.7; margin-top:16px; }}
  .cover .foot {{ display:flex; justify-content:space-between; font-size:8px; letter-spacing:1.5px;
                  text-transform:uppercase; opacity:.55; }}

  /* 01 brief */
  .grid2 {{ display:grid; grid-template-columns:1fr 1fr; border-top:1px solid var(--border); margin-top:8px; }}
  .tile {{ padding:18px 20px 18px 0; border-right:1px solid var(--border); border-bottom:1px solid var(--border); }}
  .tile:nth-child(2n) {{ border-right:none; padding-left:20px; }}
  .tk {{ font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--muted); }}
  .tv {{ font-family:'Cormorant Garamond',serif; font-style:italic; font-size:18px; margin-top:4px; }}
  .enq {{ border:1px solid var(--border); background:#fff; padding:22px 26px; margin-top:28px; }}
  .enq-h {{ font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--accent); font-weight:700; margin-bottom:14px; }}
  .enq-grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:18px 24px; }}
  .ev {{ font-size:13px; margin-top:3px; color:var(--ink); }}

  /* 02 options */
  .opt {{ display:flex; gap:36px; padding:22px 0; border-top:1px solid var(--border); page-break-inside:avoid; }}
  .opt:first-of-type {{ border-top:none; }}
  .opt-img {{ position:relative; flex:0 0 46%; height:300px; background:var(--cream); overflow:hidden; }}
  .opt-img img {{ width:100%; height:100%; object-fit:cover; }}
  .opt-tag {{ position:absolute; top:16px; left:16px; background:var(--navy); color:#fff;
             font-size:8px; letter-spacing:1.5px; text-transform:uppercase; font-weight:700; padding:5px 10px; }}
  .opt-body {{ flex:1; display:flex; flex-direction:column; }}
  .opt-body h3 {{ font-size:30px; margin:4px 0 2px; }}
  .loc {{ font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--muted); }}
  .desc {{ color:#5b6474; line-height:1.6; margin:16px 0; }}
  .ams {{ display:flex; flex-wrap:wrap; gap:8px 20px; margin:6px 0 auto; }}
  .am {{ font-size:11px; color:#5b6474; }}
  .am::first-letter {{ color:var(--accent); }}
  .fromrow {{ display:flex; align-items:baseline; gap:10px; border-top:1px solid var(--border);
             padding-top:14px; margin-top:18px; }}
  .from {{ font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--muted); }}
  .fromval {{ font-size:24px; }}

  /* 03 investment (dark) */
  .dark {{ background:var(--navy); color:#dfe3ee; }}
  .dark .head {{ color:#fff; }}
  .dark .head em {{ color:var(--gold); }}
  .dark .lead {{ color:#aab2c6; }}
  .inv {{ display:flex; gap:0; margin-top:22px; page-break-inside:avoid; }}
  .inv-img {{ flex:0 0 140px; height:auto; min-height:170px; background:var(--navy2); overflow:hidden; }}
  .inv-img img {{ width:100%; height:100%; object-fit:cover; }}
  .inv-body {{ flex:1; background:var(--navy2); padding:22px 26px; }}
  .inv-body h3 {{ font-size:24px; color:#fff; margin:2px 0 6px; }}
  .inv-meta {{ font-style:italic; color:#9aa4bd; font-size:13px; border-bottom:1px solid rgba(255,255,255,.12);
              padding-bottom:14px; margin-bottom:14px; }}
  .inv-line {{ display:flex; justify-content:space-between; padding:5px 0; color:#cdd3e2; }}
  .inv-line.sub {{ color:#8b93ab; font-size:11px; border-bottom:1px dashed rgba(255,255,255,.15); padding-bottom:12px; }}
  .inv-line.bold {{ color:#fff; font-weight:600; padding-top:12px; }}
  .fee {{ border-left:2px solid var(--gold); background:rgba(201,162,74,.08); padding:12px 16px; margin-top:14px; }}
  .fee-row {{ display:flex; justify-content:space-between; color:#e7cd94; }}
  .fee-note {{ font-size:10px; color:#9aa4bd; margin-top:6px; line-height:1.5; }}
  .inv-total {{ flex:0 0 190px; background:#2a2340; display:flex; flex-direction:column;
               justify-content:center; align-items:flex-end; padding:22px 24px; }}
  .inv-total .big {{ font-size:30px; color:#fff; }}

  /* comparison (dark) */
  .cmp-wrap {{ display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:24px; }}
  .cmp {{ position:relative; border:1px solid rgba(255,255,255,.14); padding:22px; }}
  .cmp-pick {{ border-color:var(--gold); }}
  .pick {{ position:absolute; top:-11px; right:16px; background:var(--gold); color:var(--navy);
          font-size:8px; letter-spacing:1px; text-transform:uppercase; font-weight:700; padding:4px 9px; }}
  .cmp h3 {{ font-size:24px; color:#fff; margin:2px 0; }}
  .cmp-loc {{ font-size:11px; color:#8b93ab; margin-bottom:14px; }}
  .cmp-row {{ display:flex; justify-content:space-between; padding:7px 0; font-size:12px; color:#cdd3e2;
             border-bottom:1px solid rgba(255,255,255,.08); }}
  .cmp-row.fee-i {{ font-style:italic; color:#9aa4bd; }}
  .cmp-total {{ display:flex; justify-content:space-between; align-items:baseline; padding-top:14px; color:#fff; }}
  .cmp-total .serif {{ font-size:24px; }}
  .terms {{ display:flex; justify-content:space-between; font-size:10px; color:#8b93ab; margin-top:22px;
           letter-spacing:.5px; }}

  /* closing */
  .close {{ background:var(--paper); text-align:center; }}
  .close h2 {{ font-size:34px; color:var(--navy); line-height:1.2; max-width:640px; margin:0 auto; }}
  .close h2 em {{ color:var(--accent); }}
  .close .note {{ color:#8b93ab; font-style:italic; max-width:460px; margin:16px auto 26px; line-height:1.6; }}
  .cta {{ display:inline-flex; gap:12px; }}
  .btn {{ padding:14px 26px; font-size:10px; letter-spacing:2px; text-transform:uppercase; font-weight:700; }}
  .btn-p {{ background:var(--accent); color:#fff; }}
  .btn-s {{ border:1px solid var(--border); color:var(--navy); }}
  .sig {{ border-top:1px solid var(--border); margin:36px auto 0; padding-top:22px; max-width:320px; }}
  .sig .name {{ font-family:'Cormorant Garamond',serif; font-style:italic; font-size:18px; color:var(--navy); }}
  .sig .role {{ font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--muted); margin-top:4px; }}
</style></head>
<body>
  <div class="cover" style="padding:60px 56px">
    <img class="logo" src="{_logo_data_uri()}" alt="Exclusive Venue" />
    <div>
      <h1>{_esc(ctx['event_title'])} — <em>{_esc(ctx['client_name'])}</em></h1>
      <div class="prep">Prepared for {_esc(ctx['client_name'])}{f" · {_esc(ctx['window_str'])}" if ctx.get('window_str') else ''} · by Exclusive Venue</div>
    </div>
    <div class="foot"><span>Exclusive Venue · {_esc(ctx.get('region') or 'Hong Kong')}</span><span>Proposal {_esc(ctx['proposal_ref'])} · v{ctx.get('version', 1)}</span></div>
  </div>

  <section>
    <div class="eyebrow accent">01 · The brief, as we read it</div>
    <h2 class="head serif">{_headline(ctx['headline'])}</h2>
    {f'<p class="lead">{_esc(ctx["intro_copy"])}</p>' if ctx.get('intro_copy') else ''}
    <div class="grid2">{brief_tiles}</div>
    <div class="enq">
      <div class="enq-h">◆ Your enquiry · captured {_esc(ctx.get('captured_date') or '')} · ref {_esc(ctx['proposal_ref'])}</div>
      <div class="enq-grid">{enquiry_cells}</div>
    </div>
  </section>

  <section>
    <div class="eyebrow accent">02 · {_esc(ctx['option_count_word'])} options</div>
    <h2 class="head serif">Each tells a<em> different story.</em></h2>
    {option_blocks}
  </section>

  <section class="dark">
    <div class="eyebrow" style="color:var(--gold)">03 · Investment</div>
    <h2 class="head serif">Pricing,<em> without surprises.</em></h2>
    <p class="lead">Every line itemised — per-hour rate, hours booked, venue subtotal. The EVA Service Fee is shown clearly; it covers everything you don’t have to do yourself.</p>
    {invest_blocks}
  </section>

  <section class="dark">
    <div class="eyebrow" style="color:var(--gold)">For procurement · side-by-side</div>
    <h2 class="head serif">All {_esc(ctx['option_count_word'])},<em> at a glance.</em></h2>
    <div class="cmp-wrap">{compare_cards}</div>
    <div class="terms"><span>All prices in {_esc(ctx['currency'])} · quotes valid 72 hours · payment 50% at signature, 50% on handover</span></div>
  </section>

  <section class="close">
    <h2 class="serif">Shall we walk you through<em> which one speaks loudest?</em></h2>
    <p class="note">Each option is on soft hold for 72 hours. Reach out and we’ll arrange a private tour or a call this week.</p>
    <div class="cta"><span class="btn btn-p">Schedule a call</span><span class="btn btn-s">Reply via email</span></div>
    <div class="sig">
      <div class="name">{_esc(ctx['owner_name'])}</div>
      <div class="role">{_esc(ctx.get('owner_role') or 'Account manager')} · {_esc(ctx.get('region') or 'Hong Kong')} · Exclusive Venue</div>
    </div>
  </section>
</body></html>"""


def _render_to_pdf(html: str, out_path: str) -> None:
    """Chromium render of HTML → A4 PDF file. Waits for images/fonts
    (networkidle) so photos + the serif typeface are baked into the file.
    Must run in a process's MAIN thread — Playwright's sync API spawns a
    subprocess, which asyncio can't do from a worker thread on Windows."""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page()
            page.set_content(html, wait_until="networkidle")
            page.pdf(
                path=out_path,
                format="A4",
                print_background=True,
                margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
            )
        finally:
            browser.close()


def proposal_pdf_bytes(html: str) -> bytes:
    """Render `html` to PDF bytes. Runs the actual Chromium render in a fresh
    subprocess (its own main thread) so it works both in FastAPI's threadpool
    and on Windows, where a worker-thread event loop can't spawn subprocesses.
    """
    import os
    import subprocess
    import sys
    import tempfile

    api_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))  # api/
    with tempfile.TemporaryDirectory() as tmp:
        html_path = os.path.join(tmp, "proposal.html")
        pdf_path = os.path.join(tmp, "proposal.pdf")
        with open(html_path, "w", encoding="utf-8") as fh:
            fh.write(html)

        result = subprocess.run(
            [sys.executable, "-m", "app.services.proposal_pdf", html_path, pdf_path],
            cwd=api_dir,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0 or not os.path.exists(pdf_path):
            raise RuntimeError(f"PDF render failed: {(result.stderr or '')[-600:]}")
        with open(pdf_path, "rb") as fh:
            return fh.read()


if __name__ == "__main__":
    # Worker entrypoint: `python -m app.services.proposal_pdf <html> <pdf>`.
    import sys

    _in, _out = sys.argv[1], sys.argv[2]
    with open(_in, encoding="utf-8") as _fh:
        _render_to_pdf(_fh.read(), _out)
