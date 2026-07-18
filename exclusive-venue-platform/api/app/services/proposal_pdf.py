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

import html as _html
from typing import Any

from playwright.sync_api import sync_playwright


def _esc(value: Any) -> str:
    return _html.escape(str(value)) if value is not None else ""


def _money(value: Any) -> str:
    if value is None:
        return "—"
    return f"HKD {float(value):,.0f}"


def render_proposal_html(
    *,
    proposal_ref: str,
    client_name: str,
    event_title: str,
    window_str: str | None,
    intro_copy: str | None,
    meta: list[tuple[str, str]],
    venues: list[dict[str, Any]],
) -> str:
    """Build the branded proposal HTML. `venues` items:
    {name, district, description, images: [url], rows: [(label, value)], total}."""
    meta_cells = "".join(
        f'<div class="tile"><div class="tile-k">{_esc(k)}</div>'
        f'<div class="tile-v">{_esc(v)}</div></div>'
        for k, v in meta
    )

    venue_sections = ""
    for i, v in enumerate(venues, start=1):
        hero = v["images"][0] if v["images"] else None
        thumbs = "".join(
            f'<img class="thumb" src="{_esc(src)}" />' for src in v["images"][1:4]
        )
        rows = "".join(
            f'<div class="row"><span>{_esc(k)}</span><span>{_esc(val)}</span></div>'
            for k, val in v["rows"]
        )
        venue_sections += f"""
        <section class="venue">
          <div class="hero">{f'<img src="{_esc(hero)}" />' if hero else ''}</div>
          <div class="venue-body">
            <div class="eyebrow accent">Option · {i:02d}</div>
            <h2>{_esc(v['name'])}</h2>
            <div class="loc">{_esc(v.get('district') or '—')}</div>
            {f'<p class="desc">{_esc(v["description"])}</p>' if v.get('description') else ''}
            {f'<div class="thumbs">{thumbs}</div>' if thumbs else ''}
            <div class="breakdown">
              {rows}
              <div class="total"><span>Total</span><span>{_money(v['total'])}</span></div>
            </div>
          </div>
        </section>"""

    return f"""<!doctype html>
<html><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root {{ --navy:#1b2a4a; --accent:#a0192d; --cream:#f2f0ed; --paper:#fbfaf7;
           --ink:#1b2a4a; --muted:#8a8f99; --border:rgba(27,42,74,0.16); }}
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  html {{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
  body {{ font-family:'Inter',sans-serif; color:var(--ink); background:#fff; }}
  .serif {{ font-family:'Cormorant Garamond',serif; }}
  .eyebrow {{ font-size:9px; letter-spacing:2px; text-transform:uppercase; font-weight:600; }}
  .accent {{ color:var(--accent); }}
  .cover {{ background:var(--navy); color:var(--cream); padding:60px 56px; height:60vh;
            display:flex; flex-direction:column; justify-content:space-between; page-break-after:always; }}
  .logo {{ width:40px; height:40px; border:1.5px solid var(--cream); border-radius:5px;
           display:flex; align-items:center; justify-content:center; margin:0 auto; }}
  .logo i {{ width:12px; height:12px; background:var(--cream); border-radius:2px; }}
  .cover h1 {{ font-family:'Cormorant Garamond',serif; font-weight:500; font-size:40px;
               line-height:1.2; color:#e0a3ad; }}
  .cover h1 em {{ font-style:italic; }}
  .cover .prep {{ font-size:9px; letter-spacing:2px; text-transform:uppercase; opacity:.7; margin-top:16px; }}
  .cover .foot {{ display:flex; justify-content:space-between; font-size:8px; letter-spacing:1.5px;
                  text-transform:uppercase; opacity:.55; }}
  .brief {{ padding:36px 56px; }}
  .brief .intro {{ font-family:'Cormorant Garamond',serif; font-size:19px; line-height:1.6;
                   color:var(--navy); margin:12px 0 24px; max-width:620px; }}
  .tiles {{ display:flex; border-top:1px solid var(--border); }}
  .tile {{ flex:1; padding:16px 16px 16px 0; border-right:1px solid var(--border); }}
  .tile:last-child {{ border-right:none; }}
  .tile-k {{ font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--muted); }}
  .tile-v {{ font-family:'Cormorant Garamond',serif; font-style:italic; font-size:17px; margin-top:4px; }}
  .venue {{ border-top:8px solid var(--cream); page-break-inside:avoid; }}
  .venue .hero {{ width:100%; height:280px; background:var(--cream); overflow:hidden; }}
  .venue .hero img {{ width:100%; height:100%; object-fit:cover; }}
  .venue-body {{ padding:24px 56px 40px; }}
  .venue-body h2 {{ font-family:'Cormorant Garamond',serif; font-weight:500; font-size:32px; margin:2px 0 4px; }}
  .venue-body .loc {{ font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--muted); }}
  .venue-body .desc {{ color:#5b6474; line-height:1.6; margin:16px 0; max-width:620px; }}
  .thumbs {{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:16px 0; }}
  .thumb {{ width:100%; height:90px; object-fit:cover; }}
  .breakdown {{ margin-top:16px; }}
  .row {{ display:flex; justify-content:space-between; padding:8px 0; font-size:13px;
          color:#5b6474; border-bottom:1px solid var(--border); }}
  .total {{ display:flex; justify-content:space-between; padding:12px 0 0;
            font-family:'Cormorant Garamond',serif; font-size:19px; }}
  .total span:last-child {{ font-weight:600; }}
</style></head>
<body>
  <div class="cover">
    <div class="logo"><i></i></div>
    <div>
      <h1>{_esc(event_title)} — <em>{_esc(client_name)}</em></h1>
      <div class="prep">Prepared for {_esc(client_name)}{f' · {_esc(window_str)}' if window_str else ''} · by Exclusive Venue</div>
    </div>
    <div class="foot"><span>Exclusive Venue · Hong Kong</span><span>Proposal {_esc(proposal_ref)}</span></div>
  </div>
  <div class="brief">
    <div class="eyebrow accent">The brief</div>
    {f'<p class="intro">{_esc(intro_copy)}</p>' if intro_copy else ''}
    <div class="tiles">{meta_cells}</div>
  </div>
  {venue_sections}
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
