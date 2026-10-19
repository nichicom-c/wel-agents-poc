import { FlaskConicalIcon } from "lucide-react";

import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type DemoRoleSwitcherProps<Role extends string> = {
  /** ラジオの id 接頭辞。画面ごとに別の値を渡す（同一ページに複数置かない前提）。 */
  idPrefix: string;
  label: (role: Role) => string;
  onValueChange: (role: Role) => void;
  roles: readonly Role[];
  value: Role;
};

/**
 * ロールのデモ用切り替え。**実際の認可ではない**ことが画面から分かるよう、本来の操作や
 * データとは別物に見える仮設の見た目（警告色の破線 + 実験アイコン）にしている。
 * 認可が実装されたらこのコンポーネントごと消す。Training / Knowledge Review / Admin で共有。
 */
export function DemoRoleSwitcher<Role extends string>({
  idPrefix,
  label,
  onValueChange,
  roles,
  value,
}: DemoRoleSwitcherProps<Role>) {
  return (
    <FieldSet className="rounded-lg border border-warning-yellow-2 border-dashed bg-yellow-50 px-3 py-2">
      <FieldLegend
        variant="label"
        className="flex items-center gap-1.5 text-foreground"
      >
        <FlaskConicalIcon
          className="size-4 shrink-0 text-warning-yellow-2"
          aria-hidden="true"
        />
        ロール（デモ用の切り替え。実際の認可は未実装）
      </FieldLegend>
      <RadioGroup
        className="flex flex-wrap gap-x-6 gap-y-2"
        value={value}
        onValueChange={(next) => onValueChange(next as Role)}
      >
        {roles.map((role) => (
          <Field key={role} orientation="horizontal">
            <RadioGroupItem id={`${idPrefix}-${role}`} value={role} />
            <FieldLabel htmlFor={`${idPrefix}-${role}`}>
              {label(role)}
            </FieldLabel>
          </Field>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}
