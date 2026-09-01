import { useEffect, useRef, useState } from "react";
import QRCodeLib from "qrcode";

interface QRCodeProps {
  url: string;
  size?: number;
  /** 服务端下发的二维码图片（data URI），提供时直接展示图片而不用 url 重新编码 */
  img?: string | null;
}

export default function QRCode({ url, size = 220, img }: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (img || !canvasRef.current || !url) return;

    let cancelled = false;
    setError(false);

    QRCodeLib.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(() => {
      if (!cancelled) setError(true);
    });

    return () => {
      cancelled = true;
    };
  }, [url, size, img]);

  if (img) {
    return (
      <img
        src={img}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-lg bg-white"
        alt="登录二维码"
      />
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center bg-white rounded-lg"
        style={{ width: size, height: size }}
      >
        <p className="text-sm text-gray-400">二维码生成失败</p>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="rounded-lg bg-white"
    />
  );
}
