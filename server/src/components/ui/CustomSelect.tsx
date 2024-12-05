import React from 'react';
import { ChevronDown } from 'lucide-react';
import * as RadixSelect from '@radix-ui/react-select';

export interface SelectOption {
  value: string;
  label: string;
}

export interface StyleProps {
  trigger?: string;
  content?: string;
  item?: string;
  itemIndicator?: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  customStyles?: StyleProps;
  label?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  className = '',
  disabled = false,
  customStyles,
  label,
}): JSX.Element => {
  const selectedOption = options.find(option => option.value === value);
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className={label ? 'mb-4' : ''}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <RadixSelect.Root 
        value={value} 
        onValueChange={onValueChange} 
        disabled={disabled}
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <RadixSelect.Trigger
          className={`
            inline-flex items-center justify-between
            border border-gray-200 rounded-lg p-2
            bg-white cursor-pointer min-h-[38px]
            hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            text-sm w-full
            disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
            ${customStyles?.trigger || ''}
          `}
        >
          <RadixSelect.Value 
            placeholder={placeholder}
            className="flex-1 text-left"
          >
            {selectedOption?.label}
          </RadixSelect.Value>
          <RadixSelect.Icon>
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        {isOpen && (
          <RadixSelect.Portal>
            <RadixSelect.Content
              className={`
                overflow-hidden bg-white rounded-md shadow-lg
                border border-gray-200 mt-1 z-[60] w-fit
                ${customStyles?.content || ''}
              `}
              position="popper"
              sideOffset={4}
              align="start"
            >
              <RadixSelect.Viewport className="p-1">
                {options.map((option): JSX.Element => (
                  <RadixSelect.Item
                    key={option.value}
                    value={option.value}
                    className={`
                      relative flex items-center px-3 py-2 text-sm rounded text-gray-900
                      cursor-pointer bg-white hover:bg-gray-100 focus:bg-gray-100
                      focus:outline-none select-none whitespace-nowrap
                      ${customStyles?.item || ''}
                    `}
                  >
                    <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                    {customStyles?.itemIndicator && (
                      <RadixSelect.ItemIndicator className={customStyles.itemIndicator}>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </RadixSelect.ItemIndicator>
                    )}
                  </RadixSelect.Item>
                ))}
              </RadixSelect.Viewport>
            </RadixSelect.Content>
          </RadixSelect.Portal>
        )}
      </RadixSelect.Root>
    </div>
  );
};

export default CustomSelect;
