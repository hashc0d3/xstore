import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import express, { json, urlencoded } from "express";
import { AppModule } from "./app.module";
import { ensureUploadsDir, getUploadsDir } from "./store/image-store";
import { StoreService } from "./store/store.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: "80mb" }));
  app.use(urlencoded({ extended: true, limit: "80mb" }));
  await ensureUploadsDir();
  app.use(
    "/api/uploads",
    express.static(getUploadsDir(), {
      maxAge: "7d",
      immutable: true,
      index: false,
      fallthrough: false
    })
  );
  app.enableCors({
    origin:
      process.env.CORS_ORIGIN?.split(",").map((item) => item.trim()) ?? [
        "http://localhost:3000",
        "http://localhost:3001"
      ],
    credentials: true
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const storeService = app.get(StoreService);
  await storeService.ensureSeedData();

  const port = Number(process.env.PORT ?? 4000);
  // В Docker нужен IPv4 (0.0.0.0): иначе listen может быть только на ::, а fetch к 127.0.0.1 даст ECONNREFUSED.
  await app.listen(port, "0.0.0.0");
  void storeService.materializeInlineImages().catch((err: unknown) => {
    console.error("store image materialize failed", err);
  });
}
bootstrap();
