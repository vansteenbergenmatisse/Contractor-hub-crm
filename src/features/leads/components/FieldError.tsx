import { ChannelIcon } from "./ChannelIcon";

// The message under a field of the add form. Hidden (is-off) while the field is fine.
export function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p className={`fd-lerr${message ? "" : " is-off"}`} id={id} role="alert">
      <ChannelIcon name="alert" size={16} />
      <span>{message}</span>
    </p>
  );
}
