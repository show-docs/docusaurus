function css([string]: TemplateStringsArray): string {
  return string || '';
}

const style = css`
  .container:not(.fake) {
    max-width: 100% !important;
  }
`;

export const HackStyle = <style>{style}</style>;
