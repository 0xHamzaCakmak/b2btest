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

async function ensureCenter(data) {
  const existing = await prisma.center.findFirst({
    where: { name: data.name }
  });

  if (existing) {
    return prisma.center.update({
      where: { id: existing.id },
      data
    });
  }

  return prisma.center.create({ data });
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
  const center01 = await ensureCenter({
    name: "Borekci Merkez 01",
    manager: "Merkez Yetkilisi 01",
    phone: "0555 200 01 01",
    email: "merkez01@borekci.com",
    address: "Ornek Mah. Uretim Cad. No:1",
    isActive: true
  });
  const center02 = await ensureCenter({
    name: "Borekci Merkez 02",
    manager: "Merkez Yetkilisi 02",
    phone: "0555 200 02 02",
    email: "merkez02@borekci.com",
    address: "Ornek Mah. Uretim Cad. No:2",
    isActive: true
  });

  const branchConfigs = [
    { no: "01", manager: "Yetkili 01", centerId: center01.id },
    { no: "02", manager: "Yetkili 02", centerId: center01.id },
    { no: "03", manager: "Yetkili 03", centerId: center01.id },
    { no: "04", manager: "Yetkili 04", centerId: center01.id },
    { no: "05", manager: "Yetkili 05", centerId: center01.id },
    { no: "06", manager: "Yetkili 06", centerId: center02.id },
    { no: "07", manager: "Yetkili 07", centerId: center02.id },
    { no: "08", manager: "Yetkili 08", centerId: center02.id },
    { no: "09", manager: "Yetkili 09", centerId: center02.id },
    { no: "10", manager: "Yetkili 10", centerId: center02.id }
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
      centerId: branchCfg.centerId,
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
    phone: "905551110000",
    displayName: "Admin Kullanici",
    role: "admin",
    isActive: true,
    branchId: null,
    centerId: null
  });
  await upsertUser("merkez@borekci.com", {
    passwordHash,
    phone: "905551110001",
    displayName: "Merkez 01",
    role: "merkez",
    isActive: true,
    branchId: null,
    centerId: center01.id
  });
  await upsertUser("merkez2@borekci.com", {
    passwordHash,
    phone: "905551110002",
    displayName: "Merkez 02",
    role: "merkez",
    isActive: true,
    branchId: null,
    centerId: center02.id
  });
  await upsertUser("sube01@borekci.com", {
    passwordHash,
    phone: "905551110101",
    displayName: "Borekci Sube 01 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[0].id,
    centerId: null
  });
  await upsertUser("sube02@borekci.com", {
    passwordHash,
    phone: "905551110102",
    displayName: "Borekci Sube 02 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[1].id,
    centerId: null
  });
  await upsertUser("sube03@borekci.com", {
    passwordHash,
    phone: "905551110103",
    displayName: "Borekci Sube 03 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[2].id,
    centerId: null
  });
  await upsertUser("sube04@borekci.com", {
    passwordHash,
    phone: "905551110104",
    displayName: "Borekci Sube 04 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[3].id,
    centerId: null
  });
  await upsertUser("sube05@borekci.com", {
    passwordHash,
    phone: "905551110105",
    displayName: "Borekci Sube 05 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[4].id,
    centerId: null
  });
  await upsertUser("sube06@borekci.com", {
    passwordHash,
    phone: "905551110106",
    displayName: "Borekci Sube 06 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[5].id,
    centerId: null
  });
  await upsertUser("sube07@borekci.com", {
    passwordHash,
    phone: "905551110107",
    displayName: "Borekci Sube 07 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[6].id,
    centerId: null
  });
  await upsertUser("sube08@borekci.com", {
    passwordHash,
    phone: "905551110108",
    displayName: "Borekci Sube 08 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[7].id,
    centerId: null
  });
  await upsertUser("sube09@borekci.com", {
    passwordHash,
    phone: "905551110109",
    displayName: "Borekci Sube 09 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[8].id,
    centerId: null
  });
  await upsertUser("sube10@borekci.com", {
    passwordHash,
    phone: "905551110110",
    displayName: "Borekci Sube 10 Yetkilisi",
    role: "sube",
    isActive: true,
    branchId: branches[9].id,
    centerId: null
  });

  const counts = {
    users: await prisma.user.count(),
    centers: await prisma.center.count(),
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
