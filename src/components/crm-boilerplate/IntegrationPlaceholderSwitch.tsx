"use client";

import Switch from "@/components/form/switch/Switch";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

export type IntegrationPlaceholderSwitchProps = {
  defaultChecked: boolean;
  disabled?: boolean;
  name: string;
  onChange: (checked: boolean) => void;
};

export function IntegrationPlaceholderSwitch({
  defaultChecked,
  disabled = false,
  name,
  onChange,
}: IntegrationPlaceholderSwitchProps) {
  const { showToast } = useToast();

  return (
    <Switch
      defaultChecked={defaultChecked}
      onChange={(checked) => {
        onChange(checked);
        showToast(`${name} ${checked ? "enabled" : "disabled"}.`);
      }}
      disabled={disabled}
    />
  );
}
