export const providers = [
  {
    name: "Hidráulica Norte",
    slug: "hidraulica-norte",
    category: "plomeria",
    ranking: 1,
    average: 18500,
    location: "Buenos Aires",
    avatar: "/avatars/provider-default.svg",
    dailySold: 12,
    sponsor: false,
    rating: 4.8,
    reviews: 126,
    responseTime: "Responde en menos de 2 horas",
    bio: "Equipo especializado en instalaciones residenciales, detección de pérdidas y mantenimiento preventivo para consorcios.",
    services: ["Destapaciones", "Instalación de termotanques", "Reparación de pérdidas"],
    products: [
      {
        id: "hn-pvc-50-3m",
        sku: "HN-PVC-50",
        name: "Caño PVC 50mm x 3m",
        price: 12400,
        unit: "unidad",
        stock: 18,
        image: "/logo2.svg",
        description: "Ideal para desagües domiciliarios."
      },
      {
        id: "hn-kit-termofusion-20",
        sku: "HN-PP20-KIT",
        name: "Kit termofusión PP-R 20mm",
        price: 19800,
        unit: "kit",
        stock: 7,
        image: "/logo2.svg",
        description: "Incluye uniones y codos para instalación básica."
      },
      {
        id: "hn-canilla-cocina",
        sku: "HN-CAN-MONO",
        name: "Canilla monocomando cocina",
        price: 45200,
        unit: "unidad",
        stock: 0,
        image: "/logo2.svg",
        description: "Cierre cerámico, acabado cromado."
      },
      {
        id: "hn-flex-12",
        sku: "HN-FLEX-12",
        name: "Set conexiones flexibles 1/2",
        price: 7800,
        unit: "par",
        stock: 26,
        image: "/logo2.svg",
        description: "Mangueras reforzadas para agua fría/caliente."
      },
      {
        id: "hn-valvula-esferica-12",
        sku: "HN-VAL-12",
        name: "Válvula esférica 1/2",
        price: 5300,
        unit: "unidad",
        stock: 31,
        image: "/logo2.svg",
        description: "Cierre de paso metálico para instalaciones sanitarias."
      },
      {
        id: "hn-sifon-botinero",
        sku: "HN-SIF-40",
        name: "Sifón doble para cocina",
        price: 9800,
        unit: "unidad",
        stock: 14,
        image: "/logo2.svg",
        description: "Sifón flexible con salida para doble bacha."
      },
      {
        id: "hn-codo-ppr-20",
        sku: "HN-CODO-20",
        name: "Codo PP-R 20mm",
        price: 900,
        unit: "unidad",
        stock: 120,
        image: "/logo2.svg",
        description: "Accesorio termofusión para cambios de dirección."
      },
      {
        id: "hn-termotanque-80",
        sku: "HN-TERM-80",
        name: "Termotanque 80L multigas",
        price: 289000,
        unit: "unidad",
        stock: 3,
        image: "/logo2.svg",
        description: "Alto rendimiento para uso familiar."
      }
    ]
  },
  {
    name: "Electro Sur",
    slug: "electro-sur",
    category: "electricidad",
    ranking: 2,
    average: 22300,
    location: "Córdoba",
    avatar: "/avatars/provider-default.svg",
    dailySold: 9,
    sponsor: false,
    rating: 4.6,
    reviews: 94,
    responseTime: "Responde en el día",
    bio: "Cuadrilla matriculada para obras domiciliarias, tableros eléctricos y adecuaciones de seguridad.",
    services: ["Tableros eléctricos", "Puesta a tierra", "Cableado integral"],
    products: [
      {
        id: "es-disy-40a",
        sku: "ES-DIF-40A",
        name: "Disyuntor diferencial 40A",
        price: 38900,
        unit: "unidad",
        stock: 12,
        image: "/logo2.svg",
        description: "Protección para instalaciones residenciales."
      },
      {
        id: "es-cable-2-5-100",
        sku: "ES-CBL-2.5-100",
        name: "Cable unipolar 2.5mm x 100m",
        price: 61500,
        unit: "rollo",
        stock: 4,
        image: "/logo2.svg",
        description: "Apto para circuitos de tomas y usos generales."
      },
      {
        id: "es-tablero-12",
        sku: "ES-TAB-12",
        name: "Tablero embutir 12 bocas",
        price: 27400,
        unit: "unidad",
        stock: 0,
        image: "/logo2.svg",
        description: "Gabinete con puerta para térmicas y disyuntor."
      },
      {
        id: "es-termica-2x25",
        sku: "ES-TER-2X25",
        name: "Llave térmica 2x25A",
        price: 14900,
        unit: "unidad",
        stock: 21,
        image: "/logo2.svg",
        description: "Corte y protección para línea monofásica."
      },
      {
        id: "es-toma-modular",
        sku: "ES-TOMA-MOD",
        name: "Toma corriente modular 10A",
        price: 4900,
        unit: "unidad",
        stock: 58,
        image: "/logo2.svg",
        description: "Módulo para línea embutida estándar."
      },
      {
        id: "es-canaleta-2m",
        sku: "ES-CAN-2M",
        name: "Canaleta PVC 20x10 x 2m",
        price: 3600,
        unit: "unidad",
        stock: 75,
        image: "/logo2.svg",
        description: "Canalización prolija para instalaciones vistas."
      },
      {
        id: "es-prolongador-3m",
        sku: "ES-PROL-3M",
        name: "Prolongador reforzado 3m",
        price: 12500,
        unit: "unidad",
        stock: 0,
        image: "/logo2.svg",
        description: "Cable envainado con ficha y toma de seguridad."
      },
      {
        id: "es-reflector-50w",
        sku: "ES-LED-50W",
        name: "Reflector LED 50W exterior",
        price: 18700,
        unit: "unidad",
        stock: 16,
        image: "/logo2.svg",
        description: "Iluminación fría con protección para intemperie."
      }
    ]
  },
  {
    name: "Corralón Central",
    slug: "corralon-central",
    category: "corralon",
    ranking: 1,
    average: 15000,
    location: "Rosario",
    avatar: "/avatars/provider-default.svg",
    dailySold: 18,
    sponsor: true,
    rating: 4.9,
    reviews: 210,
    responseTime: "Responde en menos de 1 hora",
    bio: "Proveedor mayorista con foco en entregas ágiles y asesoramiento técnico para obras pequeñas y medianas.",
    services: ["Venta por volumen", "Entrega en obra", "Asesoramiento técnico"],
    products: [
      {
        id: "cc-cemento-50",
        sku: "CC-CEM-50",
        name: "Bolsa cemento Portland 50kg",
        price: 9800,
        unit: "unidad",
        stock: 65,
        image: "/logo2.svg",
        description: "Uso general para obra gruesa."
      },
      {
        id: "cc-ladrillo-12x18x33",
        sku: "CC-LAD-12",
        name: "Ladrillo hueco 12x18x33",
        price: 1200,
        unit: "unidad",
        stock: 0,
        image: "/logo2.svg",
        description: "Primera calidad para muros interiores y exteriores."
      },
      {
        id: "cc-arena-fina",
        sku: "CC-ARF-M3",
        name: "Arena fina lavada",
        price: 32500,
        unit: "m3",
        stock: 9,
        image: "/logo2.svg",
        description: "Material seleccionado para revoques y mezclas."
      },
      {
        id: "cc-varilla-8",
        sku: "CC-VAR-8",
        name: "Varilla hierro ADN 8mm",
        price: 7400,
        unit: "barra",
        stock: 42,
        image: "/logo2.svg",
        description: "Barra de 12m para estructuras livianas."
      },
      {
        id: "cc-cal-hidratada",
        sku: "CC-CAL-25",
        name: "Cal hidratada 25kg",
        price: 6400,
        unit: "bolsa",
        stock: 37,
        image: "/logo2.svg",
        description: "Apta para revoques y mezclas de albañilería."
      },
      {
        id: "cc-piedra-partida",
        sku: "CC-PDP-M3",
        name: "Piedra partida 6-20",
        price: 41800,
        unit: "m3",
        stock: 5,
        image: "/logo2.svg",
        description: "Árido para hormigón y bases drenantes."
      },
      {
        id: "cc-malla-sima-15",
        sku: "CC-MALLA-15",
        name: "Malla sima 15x15 4.2mm",
        price: 69000,
        unit: "paño",
        stock: 0,
        image: "/logo2.svg",
        description: "Refuerzo para carpetas y losas livianas."
      },
      {
        id: "cc-bloque-12",
        sku: "CC-BLOQ-12",
        name: "Bloque de hormigón 12x20x40",
        price: 2100,
        unit: "unidad",
        stock: 210,
        image: "/logo2.svg",
        description: "Bloque estructural para cerramientos resistentes."
      }
    ]
  },
  {
    name: "Plomería Express",
    slug: "plomeria-express",
    category: "plomeria",
    ranking: 4,
    average: 16200,
    location: "La Plata",
    avatar: "/avatars/provider-default.svg",
    dailySold: 7,
    sponsor: false,
    rating: 4.5,
    reviews: 58,
    responseTime: "Responde en menos de 3 horas",
    bio: "Atención rápida para urgencias domiciliarias, cambios de cañerías y mantenimiento general.",
    services: ["Urgencias 24hs", "Reparación de pérdidas", "Instalación de grifería"],
    products: [
      {
        id: "pe-flex-12",
        sku: "PE-FLEX-12",
        name: "Conexión flexible 1/2",
        price: 6200,
        unit: "par",
        stock: 14,
        image: "/logo2.svg",
        description: "Mangueras reforzadas para cocina y baño."
      },
      {
        id: "pe-llave-paso",
        sku: "PE-LLAVE-PASO",
        name: "Llave de paso 3/4",
        price: 8900,
        unit: "unidad",
        stock: 9,
        image: "/logo2.svg",
        description: "Cierre metálico para instalaciones sanitarias."
      }
    ]
  },
  {
    name: "Electro Andina",
    slug: "electro-andina",
    category: "electricidad",
    ranking: 5,
    average: 20500,
    location: "Mendoza",
    avatar: "/avatars/provider-default.svg",
    dailySold: 6,
    sponsor: true,
    rating: 4.7,
    reviews: 77,
    responseTime: "Responde en el día",
    bio: "Instalaciones eléctricas residenciales y comerciales con foco en seguridad.",
    services: ["Tableros", "Cableado", "Iluminación"],
    products: [
      {
        id: "ea-disy-25a",
        sku: "EA-DIF-25A",
        name: "Disyuntor diferencial 25A",
        price: 31800,
        unit: "unidad",
        stock: 11,
        image: "/logo2.svg",
        description: "Protección para circuitos hogareños."
      },
      {
        id: "ea-lampara-led",
        sku: "EA-LED-12W",
        name: "Lámpara LED 12W",
        price: 4200,
        unit: "unidad",
        stock: 32,
        image: "/logo2.svg",
        description: "Luz fría de bajo consumo."
      }
    ]
  },
  {
    name: "Carpintería Sur",
    slug: "carpinteria-sur",
    category: "carpinteria",
    ranking: 6,
    average: 27800,
    location: "Mar del Plata",
    avatar: "/avatars/provider-default.svg",
    dailySold: 4,
    sponsor: false,
    rating: 4.6,
    reviews: 41,
    responseTime: "Responde en menos de 6 horas",
    bio: "Diseño y fabricación de muebles a medida, puertas y aberturas.",
    services: ["Muebles a medida", "Restauración", "Aberturas"],
    products: [
      {
        id: "cs-madera-pino",
        sku: "CS-PINO-18",
        name: "Placa de pino 18mm",
        price: 21400,
        unit: "unidad",
        stock: 6,
        image: "/logo2.svg",
        description: "Ideal para muebles y estanterías."
      },
      {
        id: "cs-bisagra",
        sku: "CS-BIS-35",
        name: "Bisagra cazoleta 35mm",
        price: 1800,
        unit: "unidad",
        stock: 90,
        image: "/logo2.svg",
        description: "Bisagra estándar para muebles de cocina."
      }
    ]
  },
  {
    name: "Pinturería ColorMax",
    slug: "pintureria-colormax",
    category: "pintureria",
    ranking: 3,
    average: 14600,
    location: "Santa Fe",
    avatar: "/avatars/provider-default.svg",
    dailySold: 11,
    sponsor: false,
    rating: 4.4,
    reviews: 64,
    responseTime: "Responde en el día",
    bio: "Asesoramiento en pinturas interiores/exteriores y efectos decorativos.",
    services: ["Pintura interior", "Impermeabilización", "Colorimetría"],
    products: [
      {
        id: "pcx-latex-20",
        sku: "PCX-LTX-20",
        name: "Látex interior 20L",
        price: 35600,
        unit: "balde",
        stock: 12,
        image: "/logo2.svg",
        description: "Acabado mate lavable."
      },
      {
        id: "pcx-imper-10",
        sku: "PCX-IMP-10",
        name: "Impermeabilizante 10L",
        price: 49800,
        unit: "balde",
        stock: 4,
        image: "/logo2.svg",
        description: "Protección para terrazas y paredes."
      }
    ]
  },
  {
    name: "Ferretería Norte",
    slug: "ferreteria-norte",
    category: "ferreteria",
    ranking: 7,
    average: 13200,
    location: "San Juan",
    avatar: "/avatars/provider-default.svg",
    dailySold: 5,
    sponsor: false,
    rating: 4.3,
    reviews: 29,
    responseTime: "Responde en menos de 4 horas",
    bio: "Atención de ferretería general, herramientas y accesorios.",
    services: ["Venta de herramientas", "Asesoramiento técnico", "Entrega local"],
    products: [
      {
        id: "fn-taladro",
        sku: "FN-TAL-600",
        name: "Taladro percutor 600W",
        price: 68000,
        unit: "unidad",
        stock: 3,
        image: "/logo2.svg",
        description: "Incluye maletín y brocas."
      },
      {
        id: "fn-cinta",
        sku: "FN-CINT-5M",
        name: "Cinta métrica 5m",
        price: 4200,
        unit: "unidad",
        stock: 40,
        image: "/logo2.svg",
        description: "Cinta reforzada con traba."
      }
    ]
  }
];
