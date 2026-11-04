type SanitizedEmailBodyProps = {
  html?: string | null;
  text: string;
};

export default function SanitizedEmailBody({
  html,
  text,
}: SanitizedEmailBodyProps) {
  const className =
    "email-rich-text isolate min-w-0 max-w-full overflow-hidden text-sm leading-7 break-words text-gray-700 dark:text-gray-300 [&_*]:max-w-full [&_a]:break-all [&_a]:font-medium [&_a]:text-brand-600 [&_a]:underline [&_a]:underline-offset-2 dark:[&_a]:text-brand-400 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:text-gray-500 dark:[&_blockquote]:border-gray-700 dark:[&_blockquote]:text-gray-400 [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 dark:[&_code]:bg-gray-800 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:leading-tight [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:leading-tight [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_hr]:my-4 [&_hr]:border-gray-200 dark:[&_hr]:border-gray-800 [&_img]:h-auto [&_img]:max-w-full [&_img]:object-contain [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-lg [&_pre]:bg-gray-50 [&_pre]:p-3 dark:[&_pre]:bg-white/[0.03] [&_table]:my-4 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_tbody]:w-max [&_td]:border [&_td]:border-gray-200 [&_td]:p-2 dark:[&_td]:border-gray-800 [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:p-2 [&_th]:text-left dark:[&_th]:border-gray-800 dark:[&_th]:bg-white/[0.03] [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6";

  if (!html) {
    const paragraphs = text
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .filter((paragraph) => paragraph.trim());

    return (
      <div className={className}>
        {paragraphs.map((paragraph, index) => (
          <p
            className="whitespace-pre-wrap"
            key={`${index}-${paragraph.slice(0, 32)}`}
          >
            {paragraph}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
