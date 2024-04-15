import React, { FormEventHandler } from 'react';

import Content from './Content';

const PromptForm = React.forwardRef<
  HTMLInputElement,
  {
    onSubmit: FormEventHandler<HTMLFormElement>;
    isDimmed: boolean;
    isDisabled: boolean;
    placeholder: string;
  }
>(({ onSubmit, isDimmed, isDisabled, placeholder }, ref) => {
  return (
    <div className={`transition-colors${isDimmed ? '' : ' bg-gray-900'}`}>
      <Content>
        <form onSubmit={onSubmit}>
          <input
            autoFocus
            ref={ref}
            disabled={isDisabled}
            name="prompt"
            className="w-full outline-none bg-transparent text-gray-200 disabled:text-gray-500 placeholder:text-gray-500"
            placeholder={placeholder}
          />
        </form>
      </Content>
    </div>
  );
});

export default PromptForm;
