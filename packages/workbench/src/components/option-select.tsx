import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectOption = {
  label: string;
  value: string;
};

export type OptionSelectProps = {
  "aria-label"?: string;
  className?: string;
  id?: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  value: string;
};

/**
 * `{ value, label }` の配列をそのまま渡せる Select。Base UI の Select は選択中の値から
 * ラベルを引くために root の `items` を必要とするため、ここで options から組み立てる
 * （Knowledge Review / Admin の多数のマスタ選択で使い回す）。
 */
export function OptionSelect({
  className,
  id,
  onValueChange,
  options,
  value,
  ...props
}: OptionSelectProps) {
  const items = Object.fromEntries(
    options.map((option) => [option.value, option.label]),
  );

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onValueChange(String(next ?? ""))}
    >
      <SelectTrigger
        id={id}
        className={className ?? "w-full"}
        aria-label={props["aria-label"]}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
