export function remarkReadingTime() {
  return (tree, file) => {
    const text = [];
    const walk = (node) => {
      if (node.type === 'text' || node.type === 'inlineCode') text.push(node.value);
      (node.children || []).forEach(walk);
    };
    walk(tree);
    const words = text.join(' ').split(/\s+/).filter(Boolean).length;
    file.data.astro.frontmatter.minutesRead = Math.max(1, Math.ceil(words / 200));
  };
}
