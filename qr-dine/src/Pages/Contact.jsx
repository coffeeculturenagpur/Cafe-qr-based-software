import React, { useState } from "react";
import Navbar from "../Components/Home/Navbar";

export default function Contact() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    alert("Thanks! We received your message.");
    setName("");
    setPhone("");
    setMessage("");
  };

  return (
    <>
      <Navbar />
      <main className="pt-20 px-6">
        <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-md border border-orange-100 p-6">
          <h1 className="text-3xl font-extrabold text-orange-600 mb-2">
            Contact Us
          </h1>
          <p className="text-gray-600 mb-6">
            Have a question or feedback? Send us a message.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full p-3 border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
              required
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="w-full p-3 border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message"
              rows={4}
              className="w-full p-3 border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
              required
            />
            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-300 text-white font-bold rounded-lg shadow hover:brightness-110 transition"
            >
              Send
            </button>
          </form>
        </div>
      </main>
    </>
  );
}

