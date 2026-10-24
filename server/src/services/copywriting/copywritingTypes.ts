import { z } from "@hatch/space-sdk";

export interface DraftFields {
  stt: string;
  productName: string;
  scale: string;
  maker: string;
  color: string;
  price: string;
  stock: string;
  ship: string;
  imageUrl: string;
  videoUrl: string;
  sellingPoint: string;
  sizeCm: string;
}

export const OTHER_CAR_BRANDS = [
  "Mercedes-Benz",
  "Mercedes",
  "Maybach",
  "BMW",
  "Audi",
  "Porsche",
  "Ferrari",
  "Lamborghini",
  "McLaren",
  "Aston Martin",
  "Bentley",
  "Rolls-Royce",
  "Rolls Royce",
  "Bugatti",
  "Maserati",
  "Land Rover",
  "Range Rover",
  "Jaguar",
  "Lexus",
  "Toyota",
  "Honda",
  "Nissan",
  "Mazda",
  "Subaru",
  "Mitsubishi",
  "Ford",
  "Chevrolet",
  "Dodge",
  "Jeep",
  "Cadillac",
  "Volvo",
  "Volkswagen",
  "Hyundai",
  "Kia",
  "Pagani",
  "Koenigsegg",
  "Alfa Romeo",
];

export const BRAND_FAMILIES: string[][] = [["Land Rover", "Range Rover"]];

export const professionalCopySchema = z.object({
  caption: z.string().min(40).max(3200),
});
