"use client";

interface Props {
  accountNumber: string;
}

/**
 * Triggers the CSV export endpoint. Server-side route does the heavy lifting
 * so the client can stay tiny.
 */
export function ExportButton({ accountNumber }: Props) {
  return (
    <a
      className="hud-button"
      href={`/api/export/${accountNumber}`}
      download={`trades_${accountNumber}.csv`}
    >
      ⤓ Export CSV
    </a>
  );
}
