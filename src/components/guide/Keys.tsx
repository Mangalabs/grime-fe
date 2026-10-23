// A key combination, e.g. <Keys keys={["Ctrl", "K"]} />.
export function Keys({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((key, index) => (
        <span key={key}>
          {index > 0 && " "}
          <kbd>{key}</kbd>
        </span>
      ))}
    </>
  );
}
