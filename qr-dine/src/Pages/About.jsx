import React from "react";
import Navbar from "../Components/Home/Navbar";
import AboutUs from "../Components/Home/AboutUs";

export default function About() {
  return (
    <>
      <Navbar />
      <main className="pt-16">
        <AboutUs />
      </main>
    </>
  );
}

