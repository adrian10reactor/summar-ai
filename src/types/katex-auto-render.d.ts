declare module "katex/contrib/auto-render" {
  type AutoRenderOptions = {
    delimiters: { left: string; right: string; display: boolean }[];
    throwOnError?: boolean;
    errorColor?: string;
    ignoredTags?: string[];
  };
  const renderMathInElement: (element: HTMLElement, options: AutoRenderOptions) => void;
  export default renderMathInElement;
}
