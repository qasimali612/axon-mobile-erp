import { NextResponse } from "next/server";
import bwipjs from "bwip-js/node";
import { apiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const text = (searchParams.get("text") || "").trim();
    if (!text) {
      return new Response("Barcode text is required", { status: 400 });
    }

    const bcidParam = (searchParams.get("bcid") || "code128").toLowerCase();
    const bcid = bcidParam === "ean13" ? "ean13" : bcidParam === "qrcode" ? "qrcode" : "code128";
    const scale = Math.max(1, Math.min(5, Number(searchParams.get("scale") || 2)));
    const height = Math.max(4, Math.min(30, Number(searchParams.get("height") || 9)));
    const includetext = searchParams.get("includetext") !== "false";

    const svg = bwipjs.toSVG({
      bcid,
      text,
      scale,
      height,
      includetext,
      textxalign: "center",
      textsize: 8,
      backgroundcolor: "FFFFFF",
    });

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: any) {
    return new Response(error?.message || "Invalid barcode", { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = await request.json();

    if (Array.isArray(body.items)) {
      const results = body.items.map((item: any) => {
        try {
          const rawText = String(item.text || "").trim();
          const bcid = item.bcid === "ean13" ? "ean13" : item.bcid === "qrcode" ? "qrcode" : "code128";
          const svg = bwipjs.toSVG({
            bcid,
            text: rawText,
            scale: Number(item.scale || 2),
            height: Number(item.height || 8),
            includetext: item.includetext !== false,
            textxalign: "center",
            textsize: 7,
            backgroundcolor: "FFFFFF",
          });
          return { id: item.id || rawText, text: rawText, svg };
        } catch (err: any) {
          return { id: item.id || item.text, text: item.text, error: err.message, svg: null };
        }
      });
      return NextResponse.json({ data: results });
    }

    const rawText = String(body.text || "").trim();
    if (!rawText) {
      return NextResponse.json({ error: "Missing barcode text" }, { status: 400 });
    }

    const bcid = body.bcid === "ean13" ? "ean13" : body.bcid === "qrcode" ? "qrcode" : "code128";
    const svg = bwipjs.toSVG({
      bcid,
      text: rawText,
      scale: Number(body.scale || 2),
      height: Number(body.height || 8),
      includetext: body.includetext !== false,
      textxalign: "center",
      textsize: 8,
      backgroundcolor: "FFFFFF",
    });

    return NextResponse.json({ data: { svg, text: rawText, bcid } });
  } catch (error) {
    return apiError(error);
  }
}

