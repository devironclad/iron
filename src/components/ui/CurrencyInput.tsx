"use client";

import { useState, useEffect } from "react";

interface CurrencyInputProps {
  name: string;
  value: any;
  onChange: (e: any) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export function CurrencyInput({
  name,
  value,
  onChange,
  placeholder = "0.00",
  disabled = false,
  style = {},
  className = "",
}: CurrencyInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState("");

  useEffect(() => {
    if (!isFocused) {
      if (value === null || value === undefined || value === "") {
        setLocalValue("");
      } else {
        const num = Number(value);
        if (isNaN(num)) {
          setLocalValue("");
        } else {
          setLocalValue(
            new Intl.NumberFormat("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(num)
          );
        }
      }
    } else {
      setLocalValue(value === null || value === undefined ? "" : String(value));
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setLocalValue(value === null || value === undefined ? "" : String(value));
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (value === null || value === undefined || value === "") {
      setLocalValue("");
    } else {
      const num = Number(value);
      if (isNaN(num)) {
        setLocalValue("");
      } else {
        setLocalValue(
          new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(num)
        );
      }
    }
  };

  const handleChangeLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalValue(val);
    const cleanVal = val.replace(/[^0-9.-]/g, "");
    onChange({ target: { name, value: cleanVal, type: "number" } } as any);
  };

  return (
    <div className="currency-input-wrapper" style={{ width: "100%" }}>
      <span className="currency-symbol">$</span>
      <input
        type={isFocused ? "number" : "text"}
        step="any"
        name={name}
        value={localValue}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChangeLocal}
        placeholder={placeholder}
        disabled={disabled}
        className={className || "input-field currency"}
        style={{
          ...style,
          textAlign: isFocused ? "left" : "right",
          paddingRight: isFocused ? "0.75rem" : "1.25rem",
        }}
      />
    </div>
  );
}
