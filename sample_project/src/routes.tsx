import React from "react";
import { Route, Routes } from "react-router-dom";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
    </Routes>
  );
}

function Home() {
  return (
    <main>
      <h1>Welcome QA Team</h1>
      <button>Run Checks</button>
    </main>
  );
}

function About() {
  return (
    <main>
      <h1>About Product</h1>
      <button>Contact Support</button>
    </main>
  );
}
