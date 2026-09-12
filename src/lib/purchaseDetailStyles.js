/* Estilo compartido del detalle imprimible, alineado con la interfaz de la web. */
export const purchaseDetailStyles = `
  * { box-sizing: border-box; }
  body { margin: 0; color: #17211c; background: radial-gradient(ellipse at top left, #d8eee5, transparent 65%), #f6f8f4; font-family: "Nunito", system-ui, -apple-system, sans-serif; line-height: 1.5; }
  main { width: min(920px, calc(100% - 32px)); margin: 36px auto; padding: clamp(20px, 4vw, 40px); background: #ffffffed; border: 1px solid #17211c1a; border-radius: 20px; box-shadow: 0 20px 55px #203d3214; }
  h1, h2, p { margin: 0; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding-bottom: 28px; border-bottom: 1px solid #17211c1a; margin-bottom: 24px; }
  header > div { min-width: 0; }
  h1 { font-size: clamp(24px, 4vw, 32px); line-height: 1.2; font-weight: 850; letter-spacing: -.035em; }
  h1::after { content: ""; display: block; width: 64px; height: 4px; margin-top: 12px; border-radius: 8px; background: linear-gradient(90deg, #16c784, #229478); }
  .brand { margin-bottom: 8px; font-size: 14px; color: #0f7a54; font-weight: 750; overflow-wrap: anywhere; }
  .meta { text-align: right; font-size: 14px; }
  .meta > p:first-child { display: inline-block; background: #edf6f1; border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; }
  .muted { color: #66736b; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .field { padding: 14px 16px; border: 1px solid #17211c0d; border-radius: 12px; background: #f6f8f6; overflow-wrap: anywhere; font-size: 15px; }
  .field strong { display: block; color: #66736b; font-size: 12px; font-weight: 650; margin-bottom: 4px; }
  h2 { font-size: 18px; margin: 28px 0 12px; }
  .table-wrap { overflow-x: auto; border: 1px solid #17211c14; border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 14px 12px; vertical-align: top; border-bottom: 1px solid #17211c0d; }
  th { background: #edf6f1; color: #466456; font-size: 12px; font-weight: 750; }
  tbody tr:last-child td { border-bottom: 0; }
  td:first-child { font-weight: 650; overflow-wrap: anywhere; }
  .number { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals { width: min(390px, 100%); margin: 24px 0 0 auto; padding: 16px 20px; border-radius: 14px; background: #edf6f1; border: 1px solid #cfe7db; }
  .total-row { display: flex; justify-content: space-between; align-items: baseline; gap: 18px; padding: 8px 0; font-size: 14px; }
  .total-row strong { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .total-row:last-child { border-top: 1px solid #17211c14; margin-top: 4px; font-size: 21px; font-weight: 800; }
  .totals--cancelled { background: #f5f6f5; border-color: #dfe4e0; }
  .totals--cancelled .total-row:last-child { font-size: 15px; color: #66736b; }
  .cancelled-notice { margin: 0 0 20px; padding: 16px 18px; border: 1px solid #ecc9c2; border-left: 4px solid #b95748; border-radius: 12px; background: #fff4f1; color: #893c30; }
  .cancelled-notice p { margin-top: 4px; font-size: 13px; }
  .actions { display: flex; justify-content: flex-end; margin-top: 24px; }
  button { border: 1px solid #ffffff47; border-radius: 10px; padding: 11px 20px; background: linear-gradient(180deg, #3f8fc0, #1e5d92); color: white; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; box-shadow: inset 0 1px 0 #ffffff57, 0 7px 12px #204a5b26; }
  button:hover { filter: brightness(1.08); }
  button:focus-visible { outline: 3px solid #16c784; outline-offset: 3px; }
  @media (max-width: 600px) { main { width: calc(100% - 20px); margin: 10px auto; padding: 20px 16px; } header { flex-direction: column; align-items: stretch; gap: 18px; } .meta { text-align: left; } .grid { grid-template-columns: 1fr; } th, td { padding: 10px 8px; } .actions button { width: 100%; } }
  @media print { body { background: white; } main { width: 100%; margin: 0; padding: 12px; border: 0; box-shadow: none; } .actions { display: none; } header, .field, tr, .totals, .cancelled-notice { break-inside: avoid; } .table-wrap { overflow: visible; } }
`;
