"use client";
import { useEffect, useState } from "react";

export default function Home() {
  const [apiStatus, setApiStatus] = useState("Loading...");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/")
      .then((res) => res.json())
      .then((data) => setApiStatus(data.status))
      .catch((err) => setApiStatus("Backend is offline."));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 text-white p-24">
      <h1 className="text-5xl font-bold mb-8">Smart Supply Chain Control Tower</h1>
      <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg shadow-xl text-center">
        <h2 className="text-xl text-gray-400 mb-2">Backend Connection Status:</h2>
        <p className={`text-2xl font-mono ${apiStatus.includes("live") ? "text-green-400" : "text-red-500"}`}>
          {apiStatus}
        </p>
      </div>
    </main>
  );
}