export function parseBrlPerThousand(rateLabel: string): number {
  const match = rateLabel.match(/R\$\s*([\d.]+,\d{2}|\d+(?:[.,]\d+)?)/i);
  if (!match) return 50;
  const normalized = match[1].replace(/\./g, '').replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) && num > 0 ? num : 50;
}

export function calculateConvertedBrl(points: number, rateLabel: string): number {
  const brlPerThousand = parseBrlPerThousand(rateLabel);
  return (points / 1000) * brlPerThousand;
}

export function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function calculatePointsForBrl(targetBrl: number, rateLabel: string): number {
  const brlPerThousand = parseBrlPerThousand(rateLabel);
  return Math.ceil((targetBrl / brlPerThousand) * 1000);
}
