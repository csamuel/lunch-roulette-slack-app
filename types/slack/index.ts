// Base Block Interface
interface Block {
  type: string;
  block_id?: string;
}

// Text Objects
type TextObject = PlainTextObject | MrkdwnTextObject;

interface PlainTextObject {
  type: 'plain_text';
  text: string;
  emoji?: boolean;
}

interface MrkdwnTextObject {
  type: 'mrkdwn';
  text: string;
  verbatim?: boolean;
}

// Confirm Object
interface ConfirmObject {
  title: PlainTextObject;
  text: TextObject;
  confirm: PlainTextObject;
  deny: PlainTextObject;
  style?: 'primary' | 'danger';
}

// Option Objects
interface OptionObject {
  text: PlainTextObject;
  value: string;
  description?: PlainTextObject;
  url?: string;
}

interface OptionGroupObject {
  label: PlainTextObject;
  options: OptionObject[];
}

// Block Elements
type BlockElement =
  | ButtonElement
  | ImageElement
  | SelectElement
  | OverflowElement
  | DatePickerElement
  | TimePickerElement
  | CheckboxesElement
  | RadioButtonsElement
  | PlainTextInputElement;

interface ButtonElement {
  type: 'button';
  action_id: string;
  text: PlainTextObject;
  url?: string;
  value?: string;
  style?: 'primary' | 'danger';
  confirm?: ConfirmObject;
  accessibility_label?: string;
}

interface ImageElement {
  type: 'image';
  image_url: string;
  alt_text: string;
}

interface SelectElement {
  type:
    | 'static_select'
    | 'users_select'
    | 'conversations_select'
    | 'channels_select'
    | 'external_select';
  action_id: string;
  placeholder: PlainTextObject;
  initial_option?: OptionObject;
  options?: OptionObject[];
  option_groups?: OptionGroupObject[];
  confirm?: ConfirmObject;
  focus_on_load?: boolean;
  min_query_length?: number;
}

interface OverflowElement {
  type: 'overflow';
  action_id: string;
  options: OptionObject[];
  confirm?: ConfirmObject;
}

interface DatePickerElement {
  type: 'datepicker';
  action_id: string;
  initial_date?: string;
  placeholder?: PlainTextObject;
  confirm?: ConfirmObject;
  focus_on_load?: boolean;
}

interface TimePickerElement {
  type: 'timepicker';
  action_id: string;
  initial_time?: string;
  placeholder?: PlainTextObject;
  confirm?: ConfirmObject;
  focus_on_load?: boolean;
}

interface CheckboxesElement {
  type: 'checkboxes';
  action_id: string;
  options: OptionObject[];
  initial_options?: OptionObject[];
  confirm?: ConfirmObject;
  focus_on_load?: boolean;
}

interface RadioButtonsElement {
  type: 'radio_buttons';
  action_id: string;
  options: OptionObject[];
  initial_option?: OptionObject;
  confirm?: ConfirmObject;
  focus_on_load?: boolean;
}

interface PlainTextInputElement {
  type: 'plain_text_input';
  action_id: string;
  placeholder?: PlainTextObject;
  initial_value?: string;
  multiline?: boolean;
  min_length?: number;
  max_length?: number;
  dispatch_action_config?: DispatchActionConfig;
  focus_on_load?: boolean;
}

interface DispatchActionConfig {
  trigger_actions_on: Array<'on_enter_pressed' | 'on_character_entered'>;
}

// Block Definitions
interface SectionBlock extends Block {
  type: 'section';
  text?: TextObject;
  fields?: TextObject[];
  accessory?: BlockElement;
}

interface DividerBlock extends Block {
  type: 'divider';
}

interface ImageBlock extends Block {
  type: 'image';
  image_url: string;
  alt_text: string;
  title?: PlainTextObject;
}

interface ActionsBlock extends Block {
  type: 'actions';
  elements: BlockElement[];
}

interface ContextBlock extends Block {
  type: 'context';
  elements: Array<TextObject | ImageElement>;
}

interface InputBlock extends Block {
  type: 'input';
  label: PlainTextObject;
  element: InputBlockElement;
  hint?: PlainTextObject;
  optional?: boolean;
  dispatch_action?: boolean;
}

interface HeaderBlock extends Block {
  type: 'header';
  text: PlainTextObject;
}

interface FileBlock extends Block {
  type: 'file';
  external_id: string;
  source: string;
}

interface Message {
  ts: string;
  blocks: MessageBlock[];
}

interface Vote {
  messageTs: string;
  restaurantId: string;
  userId: string;
}

interface Action {
  action_id: 'vote' | 'finalize' | 'spin-again';
  block_id: string;
  text: {
    type: string;
    text: string;
    emoji: boolean;
  };
  value: string;
  type: string;
  action_ts: string;
}

// Input Block Elements
type InputBlockElement =
  | PlainTextInputElement
  | SelectElement
  | DatePickerElement
  | TimePickerElement
  | CheckboxesElement
  | RadioButtonsElement;

// Message Block Union Type
type MessageBlock =
  | SectionBlock
  | DividerBlock
  | ImageBlock
  | ActionsBlock
  | ContextBlock
  | InputBlock
  | HeaderBlock
  | FileBlock;

// Exporting Types
export {
  Block,
  TextObject,
  PlainTextObject,
  MrkdwnTextObject,
  ConfirmObject,
  OptionObject,
  OptionGroupObject,
  BlockElement,
  ButtonElement,
  ImageElement,
  SelectElement,
  OverflowElement,
  DatePickerElement,
  TimePickerElement,
  CheckboxesElement,
  RadioButtonsElement,
  PlainTextInputElement,
  DispatchActionConfig,
  SectionBlock,
  DividerBlock,
  ImageBlock,
  ActionsBlock,
  ContextBlock,
  InputBlock,
  HeaderBlock,
  FileBlock,
  MessageBlock,
  Message,
  Vote,
  Action,
};
