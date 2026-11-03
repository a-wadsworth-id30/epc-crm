type SanitizedEmailBodyProps = {
  html?: string | null;
  text: string;
};

export default function SanitizedEmailBody({
  html,
  text,
}: SanitizedEmailBodyProps) {
  if (!html) {
    return <p className="whitespace-pre-wrap">{text}</p>;
  }

  return (
    <div
      className="email-rich-text [&_a]:break-all [&_a]:font-medium [&_a]:text-brand-600 [&_a]:underline [&_a]:underline-offset-2 dark:[&_a]:text-brand-400 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:text-gray-500 dark:[&_blockquote]:border-gray-700 dark:[&_blockquote]:text-gray-400 [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 dark:[&_code]:bg-gray-800 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:font-semibold [&_hr]:my-4 [&_hr]:border-gray-200 dark:[&_hr]:border-gray-800 [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-lg [&_pre]:bg-gray-50 [&_pre]:p-3 dark:[&_pre]:bg-white/[0.03] [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:p-2 dark:[&_td]:border-gray-800 [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:p-2 [&_th]:text-left dark:[&_th]:border-gray-800 dark:[&_th]:bg-white/[0.03] [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
