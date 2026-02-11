import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: {
                    DEFAULT: "rgb(10 10 15)",
                    secondary: "rgb(19 19 26)",
                    tertiary: "rgb(26 26 36)",
                },
                border: {
                    DEFAULT: "rgb(39 39 47)",
                    hover: "rgb(58 58 68)",
                },
                text: {
                    primary: "rgb(255 255 255)",
                    secondary: "rgb(161 161 170)",
                    tertiary: "rgb(113 113 122)",
                },
                accent: {
                    purple: {
                        DEFAULT: "rgb(139 92 246)",
                        light: "rgb(167 139 250)",
                        dark: "rgb(124 58 237)",
                    },
                    blue: {
                        DEFAULT: "rgb(99 102 241)",
                        light: "rgb(129 140 248)",
                        dark: "rgb(79 70 229)",
                    },
                },
                status: {
                    success: "rgb(34 197 94)",
                    error: "rgb(239 68 68)",
                    warning: "rgb(245 158 11)",
                    running: "rgb(234 179 8)",
                },
                node: {
                    text: "rgb(59 130 246)",
                    image: "rgb(34 197 94)",
                    video: "rgb(139 92 246)",
                    llm: "rgb(245 158 11)",
                    processing: "rgb(6 182 212)",
                },
            },
            fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"],
                mono: ["JetBrains Mono", "monospace"],
            },
            spacing: {
                "18": "4.5rem",
                "88": "22rem",
                "120": "30rem",
            },
            boxShadow: {
                "glow-sm": "0 0 10px rgb(139 92 246 / 0.3)",
                "glow-md": "0 0 20px rgb(139 92 246 / 0.4)",
                "glow-lg": "0 0 30px rgb(139 92 246 / 0.5)",
            },
            animation: {
                "pulse-glow": "pulse-glow 2s ease-in-out infinite",
                "dash-draw": "dash-draw 20s linear infinite",
            },
            keyframes: {
                "pulse-glow": {
                    "0%, 100%": {
                        boxShadow: "0 0 20px rgb(139 92 246 / 0.6), 0 0 40px rgb(139 92 246 / 0.4)",
                    },
                    "50%": {
                        boxShadow: "0 0 30px rgb(139 92 246 / 0.8), 0 0 60px rgb(139 92 246 / 0.6)",
                    },
                },
                "dash-draw": {
                    from: { strokeDashoffset: "1000" },
                    to: { strokeDashoffset: "0" },
                },
            },
        },
    },
    plugins: [],
};

export default config;
