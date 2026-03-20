interface Props {
  onRespin: () => void;
  onFinalize: () => void;
  disabled: boolean;
}

export default function SpinnerControls({ onRespin, onFinalize, disabled }: Props) {
  return (
    <div className="spinner-controls">
      <button className="btn-secondary" onClick={onRespin} disabled={disabled}>
        Spin Again
      </button>
      <button className="btn-danger" onClick={onFinalize} disabled={disabled}>
        Finalize
      </button>
    </div>
  );
}
