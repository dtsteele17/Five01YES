'use client';

interface DayPickerChipsProps {
  selectedDays: string[];
  onChange: (days: string[]) => void;
}

const days = [
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
  { short: 'Sun', full: 'Sunday' },
];

export function DayPickerChips({ selectedDays, onChange }: DayPickerChipsProps) {
  const toggleDay = (day: string) => {
    if (selectedDays.includes(day)) {
      onChange(selectedDays.filter((d) => d !== day));
    } else {
      onChange([...selectedDays, day]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {days.map((day) => {
        const isSelected = selectedDays.includes(day.short);
        return (
          <button
            key={day.short}
            type="button"
            onClick={() => toggleDay(day.short)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              isSelected
                ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/20'
                : 'bg-slate-800/50 text-gray-400 border border-white/10 hover:border-teal-500/50 hover:text-white'
            }`}
          >
            {day.short}
          </button>
        );
      })}
    </div>
  );
}
