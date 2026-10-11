export function getMonthGrid(year: number, monthIndex: number): Array<Date | null> {
  const firstDay = new Date(year, monthIndex, 1, 12);
  const daysInMonth = new Date(year, monthIndex + 1, 0, 12).getDate();
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const cellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - leadingDays + 1;
    return day >= 1 && day <= daysInMonth ? new Date(year, monthIndex, day, 12) : null;
  });
}
