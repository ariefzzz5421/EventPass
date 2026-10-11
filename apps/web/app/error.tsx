"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){return <main className="container page"><div className="page-heading"><span className="eyebrow">EVENTPASS</span><h1>Something went wrong</h1><p>We could not load this page. Please try again.</p></div><Button onClick={reset}>Try again</Button></main>}
