import { readFile } from "node:fs/promises";
import path from "node:path";
import Head from "next/head";
import Script from "next/script";
import type { GetStaticProps } from "next";

type HomeProps = { markup: string };

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const html = await readFile(path.join(process.cwd(), "index.html"), "utf8");
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if (!body) throw new Error("Could not load the existing FreelancePK interface.");
  return { props: { markup: body } };
};

export default function Home({ markup }: HomeProps) {
  return (
    <>
      <Head>
        <title>FreelancePK | Freelancer workbench</title>
        <meta name="description" content="A practical client, invoice, and rate workbench for freelancers in Pakistan." />
        <meta name="theme-color" content="#f4f3ef" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/frontend/styles.css" />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: markup }} />
      <Script src="/frontend/app.js" strategy="afterInteractive" />
    </>
  );
}