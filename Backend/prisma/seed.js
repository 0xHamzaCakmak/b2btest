require("dotenv").config();
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function ensureBranch(data) {
  const existing = await prisma.branch.findFirst({
    where: { name: data.name }
  });

  if (existing) {
    return prisma.branch.update({
      where: { id: existing.id },
      data
    });
  }

  return prisma.branch.create({ data });
}

async function upsertUser(email, data) {
  return prisma.user.upsert({
    where: { email },
    update: data,
    create: {
      email,
      ...data
    }
  });
}

async function upsertProduct(code, data) {
  return prisma.product.upsert({
    where: { code },
    update: data,
    create: {
      code,
      ...data
    }
  });
}

async function main() {
  const passwordHash = await bcrypt.hash("12345678", 10);

  const branchConfigs = [
    { no: "01", manager: "Yetkili 01" },
    { no: "02", manager: "Yetkili 02" },
    { no: "03", manager: "Yetkili 03" },
    { no: "04", manager: "Yetkili 04" },
    { no: "05", manager: "Yetkili 05" }
  ];

  const branches = [];
  for (const branchCfg of branchConfigs) {
    const no = branchCfg.no;
    const idx = Number(no);
    const branch = await ensureBranch({
      name: "Borekci Sube " + no,
      manager: branchCfg.manager,
      phone: "0555 100 " + no + " " + no,
      email: "sube" + no + "@ornek.com",
      address: "Ornek Mah. Borek Sok. No:" + idx,
      isActive: true
    });
    branches.push(branch);

    await prisma.branchPriceAdjustment.upsert({
      where: { branchId: branch.id },
      update: { percent: 0 },
      create: { branchId: branch.id, percent: 0 }
    });
  }

  await upsertProduct("su_boregi", {
    name: "Su Boregi",
    basePrice: 700,
    isActive: true
  });
  await upsertProduct("peynirli_borek", {
    name: "Peynirli Borek",
    basePrice: 650,
    isActive: true
  });
  await upsertProduct("kiymali_borek", {
    name: "Kiymali Borek",
    basePrice: 730,
    isActive: true
  });
  await upsertProduct("patatesli_borek", {
    name: "Patatesli Borek",
    basePrice: 610,
    isActive: true
  });
  await upsertProduct("ispanakli_borek", {
    name: "Ispanakli Borek",
    basePrice: 640,
    isActive: true
  });
  await upsertProduct("kasarli_borek", {
    name: "Kasarli Borek",
    basePrice: 680,
    isActive: true
  });
  await upsertProduct("kol_boregi", {
    name: "Kol Boregi",
    basePrice: 760,
    isActive: true
  });
  await upsertProduct("karisik_borek", {
    name: "Karisik Borek",
    basePrice: 790,
    isActive: true
  });
  await upsertProduct("biberli_ekmek", {
    name: "Biberli Ekmek",
    basePrice: 1150,
    isActive: true
  });

  await upsertUser("admin@borekci.com", {
    passwordHash,
    displayName: "Admin Kullanici",
    role: "admin",
    isActive: true,
    branchId: null
  });
  await upsertUser("merkez@borekci.com", {
    passwordHash,
    displayName: "Merkez 01",
    role: "merkez",
    isActive: true,
    branchId: null
  });
  await upsertUser("sube01@borekci.com", {
    passwordHash,
    displayName: "Borekci Sube 01 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[0].id
  });
  await upsertUser("sube02@borekci.com", {
    passwordHash,
    displayName: "Borekci Sube 02 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[1].id
  });
  await upsertUser("sube03@borekci.com", {
    passwordHash,
    displayName: "Borekci Sube 03 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[2].id
  });
  await upsertUser("sube04@borekci.com", {
    passwordHash,
    displayName: "Borekci Sube 04 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[3].id
  });
  await upsertUser("sube05@borekci.com", {
    passwordHash,
    displayName: "Borekci Sube 05 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[4].id
  });

  const counts = {
    users: await prisma.user.count(),
    branches: await prisma.branch.count(),
    products: await prisma.product.count(),
    branchPriceAdjustments: await prisma.branchPriceAdjustment.count()
  };

  console.log("[seed] completed", counts);
  console.log("[seed] demo password for all users: 12345678");
}

main()
  .catch((e) => {
    console.error("[seed] failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
