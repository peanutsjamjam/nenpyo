// 暦（1582年より前はユリウス暦、以降はグレゴリオ暦でうるう年判定）。
// 月ごとに実際の日数を持つ（2月は平年28日・閏年29日）。
// 注: グレゴリオ改暦(1582/10)で消えた10日間のズレ自体はモデル化していない（閏年判定のみ切替）。
// フロント全体（App / api クライアント）で共有する単一の実装。

export function isLeap(year: number): boolean {
  if (year < 1582) return year % 4 === 0 // ユリウス暦: 4で割り切れれば閏年
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 // グレゴリオ暦
}

export function daysInYear(year: number): number {
  return isLeap(year) ? 366 : 365
}

export function monthLengths(year: number): number[] {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
}

export function daysInMonth(year: number, month: number): number {
  return monthLengths(year)[month - 1]
}
