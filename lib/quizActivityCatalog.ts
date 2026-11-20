// Curated training content. Customer examples are guidance, not Motisons policy.
import type { GameDefinition, QuestionTemplate } from "@/lib/quizActivityTypes";
export const QUESTION_LIBRARY: QuestionTemplate[] = [
  {
    "id": "q001",
    "category": "Diamond & Jewellery",
    "question": "Diamond में Carat क्या बताता है?",
    "options": [
      "वजन",
      "रंग",
      "शुद्धता"
    ],
    "correctIndex": 0,
    "explanation": "Carat हीरे के वजन की इकाई है।",
    "visual": "diamond"
  },
  {
    "id": "q002",
    "category": "Diamond & Jewellery",
    "question": "Diamond के 4Cs में कौन शामिल है?",
    "options": [
      "Cost",
      "Country",
      "Clarity"
    ],
    "correctIndex": 2,
    "explanation": "4Cs: Cut, Colour, Clarity और Carat weight हैं।",
    "visual": "diamond"
  },
  {
    "id": "q003",
    "category": "Diamond & Jewellery",
    "question": "Diamond की clarity किससे जुड़ी है?",
    "options": [
      "Ring size",
      "Inclusions और blemishes",
      "Gold purity"
    ],
    "correctIndex": 1,
    "explanation": "Clarity में अंदरूनी inclusions और सतह के blemishes देखे जाते हैं।",
    "visual": "diamond"
  },
  {
    "id": "q004",
    "category": "Diamond & Jewellery",
    "question": "Diamond का cut मुख्यतः क्या प्रभावित करता है?",
    "options": [
      "रोशनी का प्रदर्शन",
      "सोने का वजन",
      "ग्राहक की उम्र"
    ],
    "correctIndex": 0,
    "explanation": "Cut के proportions और symmetry रोशनी के प्रदर्शन पर असर डालते हैं।",
    "visual": "diamond"
  },
  {
    "id": "q005",
    "category": "Diamond & Jewellery",
    "question": "Diamond का मुख्य chemical element क्या है?",
    "options": [
      "Gold",
      "Silver",
      "Carbon"
    ],
    "correctIndex": 2,
    "explanation": "Diamond carbon से बना होता है।",
    "visual": "diamond"
  },
  {
    "id": "q006",
    "category": "Diamond & Jewellery",
    "question": "Mohs scale पर Diamond की hardness कितनी है?",
    "options": [
      "7",
      "10",
      "5"
    ],
    "correctIndex": 1,
    "explanation": "Diamond की Mohs hardness 10 है; फिर भी झटके से chip हो सकता है।",
    "visual": "diamond"
  },
  {
    "id": "q007",
    "category": "Diamond & Jewellery",
    "question": "एक ही carat के diamonds की कीमत अलग क्यों हो सकती है?",
    "options": [
      "बाकी quality factors अलग हो सकते हैं",
      "सिर्फ box अलग होता है",
      "Carat गलत इकाई है"
    ],
    "correctIndex": 0,
    "explanation": "Carat के अलावा cut, colour और clarity भी तुलना में ज़रूरी हैं।",
    "visual": "diamond"
  },
  {
    "id": "q008",
    "category": "Diamond & Jewellery",
    "question": "कौन-सा शब्द सोने की purity बताता है?",
    "options": [
      "Carat weight",
      "Clarity",
      "Karat"
    ],
    "correctIndex": 2,
    "explanation": "Karat gold purity के लिए और carat gems के वजन के लिए इस्तेमाल होता है।",
    "visual": "diamond"
  },
  {
    "id": "q009",
    "category": "Diamond & Jewellery",
    "question": "Oval shape का outline कैसा है?",
    "options": [
      "दिल जैसा",
      "लंबा गोल / अंडाकार",
      "चौकोर"
    ],
    "correctIndex": 1,
    "explanation": "Oval का बाहरी outline अंडाकार होता है।",
    "visual": "diamond"
  },
  {
    "id": "q010",
    "category": "Diamond & Jewellery",
    "question": "Pear shape का outline कैसा है?",
    "options": [
      "एक सिरा नुकीला, दूसरा गोल",
      "दोनों सिरे चौकोर",
      "पूरा गोल"
    ],
    "correctIndex": 0,
    "explanation": "Pear को teardrop shape भी कहा जाता है।",
    "visual": "diamond"
  },
  {
    "id": "q011",
    "category": "Diamond & Jewellery",
    "question": "Heart shape किससे मिलती है?",
    "options": [
      "आयत",
      "सीधी रेखा",
      "दिल"
    ],
    "correctIndex": 2,
    "explanation": "Heart shape में ऊपर दो lobes और नीचे point होता है।",
    "visual": "diamond"
  },
  {
    "id": "q012",
    "category": "Diamond & Jewellery",
    "question": "Round diamond का outline कैसा है?",
    "options": [
      "त्रिकोण",
      "गोल",
      "लंबा आयत"
    ],
    "correctIndex": 1,
    "explanation": "Round का बाहरी outline गोल होता है।",
    "visual": "diamond"
  },
  {
    "id": "q013",
    "category": "Diamond & Jewellery",
    "question": "Princess cut का सामान्य outline कैसा होता है?",
    "options": [
      "चौकोर",
      "आंसू जैसा",
      "पूरा गोल"
    ],
    "correctIndex": 0,
    "explanation": "Princess का सामान्य outline square होता है।",
    "visual": "diamond"
  },
  {
    "id": "q014",
    "category": "Diamond & Jewellery",
    "question": "Emerald cut में आम तौर पर कैसे facets दिखते हैं?",
    "options": [
      "केवल एक सपाट सतह",
      "कोई facets नहीं",
      "Step-cut facets"
    ],
    "correctIndex": 2,
    "explanation": "Emerald cut में सीढ़ीनुमा step facets होते हैं।",
    "visual": "diamond"
  },
  {
    "id": "q015",
    "category": "Diamond & Jewellery",
    "question": "Diamond की shape और cut quality क्या एक ही बात हैं?",
    "options": [
      "दोनों gold purity हैं",
      "नहीं",
      "हमेशा हाँ"
    ],
    "correctIndex": 1,
    "explanation": "Shape outline है; cut quality रोशनी के प्रदर्शन से जुड़ी है।",
    "visual": "diamond"
  },
  {
    "id": "q016",
    "category": "Diamond & Jewellery",
    "question": "Diamond को झटके से क्या हो सकता है?",
    "options": [
      "Chip हो सकता है",
      "हमेशा नरम हो जाता है",
      "सोना बन जाता है"
    ],
    "correctIndex": 0,
    "explanation": "Hardness scratch resistance है; diamond indestructible नहीं है।",
    "visual": "diamond"
  },
  {
    "id": "q017",
    "category": "Diamond & Jewellery",
    "question": "Diamond jewellery को अलग रखने का फायदा क्या है?",
    "options": [
      "Carat बढ़ता है",
      "Purity बढ़ती है",
      "आपसी scratches का जोखिम घटता है"
    ],
    "correctIndex": 2,
    "explanation": "अलग compartments stones और metal को रगड़ से बचाते हैं।",
    "visual": "diamond"
  },
  {
    "id": "q018",
    "category": "Diamond & Jewellery",
    "question": "Clarity देखने के लिए jeweller का छोटा magnifier क्या कहलाता है?",
    "options": [
      "Bangle",
      "Loupe",
      "Clasp"
    ],
    "correctIndex": 1,
    "explanation": "Loupe jewellery inspection में इस्तेमाल होने वाला magnifier है।",
    "visual": "diamond"
  },
  {
    "id": "q019",
    "category": "Diamond & Jewellery",
    "question": "Pendant आम तौर पर कहाँ पहना जाता है?",
    "options": [
      "Chain / necklace में",
      "पैर के अंगूठे में",
      "कलाई में"
    ],
    "correctIndex": 0,
    "explanation": "Pendant chain या necklace से लटकता है।",
    "visual": "diamond"
  },
  {
    "id": "q020",
    "category": "Diamond & Jewellery",
    "question": "Earring stud का सामान्य रूप क्या है?",
    "options": [
      "लंबी chain",
      "पूरी चूड़ी",
      "कान के पास बैठने वाला छोटा ornament"
    ],
    "correctIndex": 2,
    "explanation": "Stud earring कान के पास बैठता है।",
    "visual": "diamond"
  },
  {
    "id": "q021",
    "category": "Diamond & Jewellery",
    "question": "Bangle किस अंग में पहनी जाती है?",
    "options": [
      "कान",
      "कलाई",
      "गर्दन"
    ],
    "correctIndex": 1,
    "explanation": "Bangle कलाई का ornament है।",
    "visual": "diamond"
  },
  {
    "id": "q022",
    "category": "Diamond & Jewellery",
    "question": "Clasp का काम क्या है?",
    "options": [
      "Jewellery को बंद / secure करना",
      "Purity मापना",
      "Diamond काटना"
    ],
    "correctIndex": 0,
    "explanation": "Clasp necklace या bracelet को secure करता है।",
    "visual": "diamond"
  },
  {
    "id": "q023",
    "category": "Diamond & Jewellery",
    "question": "Ring size किसलिए देखी जाती है?",
    "options": [
      "Diamond colour",
      "Gold purity",
      "उंगली पर सही fitting"
    ],
    "correctIndex": 2,
    "explanation": "Ring size fit के लिए है।",
    "visual": "diamond"
  },
  {
    "id": "q024",
    "category": "Diamond & Jewellery",
    "question": "Pair of earrings में क्या जाँचना चाहिए?",
    "options": [
      "केवल brand sticker",
      "दोनों pieces का match और fastening",
      "सिर्फ box"
    ],
    "correctIndex": 1,
    "explanation": "दोनों earrings का match और fastening check करना उपयोगी है।",
    "visual": "diamond"
  },
  {
    "id": "q025",
    "category": "Diamond & Jewellery",
    "question": "Chain की length चुनते समय क्या पूछें?",
    "options": [
      "Customer की preferred length",
      "उनका password",
      "उनकी salary"
    ],
    "correctIndex": 0,
    "explanation": "Length preference पूछने से सही fit और look चुनने में मदद मिलती है।",
    "visual": "diamond"
  },
  {
    "id": "q026",
    "category": "Diamond & Jewellery",
    "question": "Diamond की surface पर characteristic को क्या कहते हैं?",
    "options": [
      "Karat",
      "Clasp",
      "Blemish"
    ],
    "correctIndex": 2,
    "explanation": "Surface characteristics को blemishes कहा जाता है।",
    "visual": "diamond"
  },
  {
    "id": "q027",
    "category": "Diamond & Jewellery",
    "question": "Diamond के भीतर characteristic को क्या कहते हैं?",
    "options": [
      "Hallmark",
      "Inclusion",
      "Invoice"
    ],
    "correctIndex": 1,
    "explanation": "अंदर के characteristics inclusions कहलाते हैं।",
    "visual": "diamond"
  },
  {
    "id": "q028",
    "category": "Diamond & Jewellery",
    "question": "Jewellery में setting का काम क्या है?",
    "options": [
      "Stone को पकड़ना",
      "Phone charge करना",
      "Invoice print करना"
    ],
    "correctIndex": 0,
    "explanation": "Setting gemstone को jewellery में secure रखती है।",
    "visual": "diamond"
  },
  {
    "id": "q029",
    "category": "Diamond & Jewellery",
    "question": "Prong किससे जुड़ा है?",
    "options": [
      "Gold rate",
      "Customer ID",
      "Stone को पकड़ने वाले छोटे claws"
    ],
    "correctIndex": 2,
    "explanation": "Prongs छोटे metal claws हैं जो stone पकड़ते हैं।",
    "visual": "diamond"
  },
  {
    "id": "q030",
    "category": "Diamond & Jewellery",
    "question": "Daily wear चुनते समय क्या ध्यान दें?",
    "options": [
      "सिर्फ box colour",
      "Comfort और secure setting",
      "सिर्फ बड़ा size"
    ],
    "correctIndex": 1,
    "explanation": "Comfort, lifestyle और setting की सुरक्षा के आधार पर सुझाव दें।",
    "visual": "diamond"
  },
  {
    "id": "q031",
    "category": "Gold & Hallmark",
    "question": "14K gold के लिए कौन-सा fineness mark है?",
    "options": [
      "585",
      "596",
      "562"
    ],
    "correctIndex": 0,
    "explanation": "14K का प्रचलित fineness mark 585 है।",
    "visual": "gold"
  },
  {
    "id": "q032",
    "category": "Gold & Hallmark",
    "question": "18K gold के लिए कौन-सा fineness mark है?",
    "options": [
      "761",
      "727",
      "750"
    ],
    "correctIndex": 2,
    "explanation": "18K का प्रचलित fineness mark 750 है।",
    "visual": "gold"
  },
  {
    "id": "q033",
    "category": "Gold & Hallmark",
    "question": "20K gold के लिए कौन-सा fineness mark है?",
    "options": [
      "810",
      "833",
      "844"
    ],
    "correctIndex": 1,
    "explanation": "20K का प्रचलित fineness mark 833 है।",
    "visual": "gold"
  },
  {
    "id": "q034",
    "category": "Gold & Hallmark",
    "question": "22K gold के लिए कौन-सा fineness mark है?",
    "options": [
      "916",
      "927",
      "893"
    ],
    "correctIndex": 0,
    "explanation": "22K का प्रचलित fineness mark 916 है।",
    "visual": "gold"
  },
  {
    "id": "q035",
    "category": "Gold & Hallmark",
    "question": "23K gold के लिए कौन-सा fineness mark है?",
    "options": [
      "969",
      "935",
      "958"
    ],
    "correctIndex": 2,
    "explanation": "23K का प्रचलित fineness mark 958 है।",
    "visual": "gold"
  },
  {
    "id": "q036",
    "category": "Gold & Hallmark",
    "question": "18K gold में gold का theoretical fraction कितना है?",
    "options": [
      "24/18",
      "18/24",
      "18/100"
    ],
    "correctIndex": 1,
    "explanation": "Karat scale में 24 parts में से gold के parts गिने जाते हैं।",
    "visual": "gold"
  },
  {
    "id": "q037",
    "category": "Gold & Hallmark",
    "question": "18K का theoretical gold percentage कितना है?",
    "options": [
      "75%",
      "18%",
      "95%"
    ],
    "correctIndex": 0,
    "explanation": "18 ÷ 24 × 100 = 75%.",
    "visual": "gold"
  },
  {
    "id": "q038",
    "category": "Gold & Hallmark",
    "question": "22K में non-gold alloy जोड़ने का एक कारण क्या है?",
    "options": [
      "Diamond carat बढ़ाना",
      "Invoice मिटाना",
      "Durability / working properties"
    ],
    "correctIndex": 2,
    "explanation": "Alloy jewellery की working properties और durability बदल सकता है।",
    "visual": "gold"
  },
  {
    "id": "q039",
    "category": "Gold & Hallmark",
    "question": "HUID का full form क्या है?",
    "options": [
      "Heavy Unique Item Design",
      "Hallmark Unique Identification",
      "High Unit Invoice Date"
    ],
    "correctIndex": 1,
    "explanation": "HUID एक hallmarked article का unique identification code है।",
    "visual": "gold"
  },
  {
    "id": "q040",
    "category": "Gold & Hallmark",
    "question": "Gold HUID में कितने alphanumeric characters होते हैं?",
    "options": [
      "6",
      "3",
      "12"
    ],
    "correctIndex": 0,
    "explanation": "HUID छह अक्षर/अंकों का code है।",
    "visual": "gold"
  },
  {
    "id": "q041",
    "category": "Gold & Hallmark",
    "question": "Gold HUID कहाँ verify किया जा सकता है?",
    "options": [
      "Calculator",
      "Camera filter",
      "BIS Care app"
    ],
    "correctIndex": 2,
    "explanation": "BIS Care के Verify HUID feature से जाँच कर सकते हैं।",
    "visual": "gold"
  },
  {
    "id": "q042",
    "category": "Gold & Hallmark",
    "question": "Gold hallmark में purity / fineness mark क्या बताता है?",
    "options": [
      "Ring size",
      "Gold purity",
      "Diamond clarity"
    ],
    "correctIndex": 1,
    "explanation": "Purity / fineness mark metal में gold content बताता है।",
    "visual": "gold"
  },
  {
    "id": "q043",
    "category": "Gold & Hallmark",
    "question": "क्या hallmark jewellery की resale price guarantee है?",
    "options": [
      "नहीं",
      "हमेशा हाँ",
      "सभी दुकानों में fixed rate"
    ],
    "correctIndex": 0,
    "explanation": "Hallmark purity assurance है; resale terms अलग से verify करें।",
    "visual": "gold"
  },
  {
    "id": "q044",
    "category": "Gold & Hallmark",
    "question": "Gold jewellery का net metal weight क्या है?",
    "options": [
      "हमेशा पूरा gross weight",
      "केवल packaging weight",
      "Stones आदि का weight हटाकर metal weight"
    ],
    "correctIndex": 2,
    "explanation": "Net metal weight और gross ornament weight अलग हो सकते हैं।",
    "visual": "gold"
  },
  {
    "id": "q045",
    "category": "Gold & Hallmark",
    "question": "Gross weight में क्या शामिल हो सकता है?",
    "options": [
      "केवल box",
      "Metal और लगे हुए stones",
      "केवल invoice paper"
    ],
    "correctIndex": 1,
    "explanation": "Item का gross weight metal और mounted stones का total हो सकता है।",
    "visual": "gold"
  },
  {
    "id": "q046",
    "category": "Weight Practice",
    "question": "0.25 carat gemstone का वजन कितना gram है?",
    "options": [
      "0.05 gram",
      "0.5 gram",
      "0.005 gram"
    ],
    "correctIndex": 0,
    "explanation": "1 carat = 0.2 gram; 0.25 × 0.2 = 0.05 gram.",
    "visual": "scale"
  },
  {
    "id": "q047",
    "category": "Weight Practice",
    "question": "0.5 carat gemstone का वजन कितना gram है?",
    "options": [
      "1 gram",
      "0.01 gram",
      "0.1 gram"
    ],
    "correctIndex": 2,
    "explanation": "1 carat = 0.2 gram; 0.5 × 0.2 = 0.1 gram.",
    "visual": "scale"
  },
  {
    "id": "q048",
    "category": "Weight Practice",
    "question": "0.75 carat gemstone का वजन कितना gram है?",
    "options": [
      "0.015 gram",
      "0.15 gram",
      "1.5 gram"
    ],
    "correctIndex": 1,
    "explanation": "1 carat = 0.2 gram; 0.75 × 0.2 = 0.15 gram.",
    "visual": "scale"
  },
  {
    "id": "q049",
    "category": "Weight Practice",
    "question": "1 carat gemstone का वजन कितना gram है?",
    "options": [
      "0.2 gram",
      "2 gram",
      "0.02 gram"
    ],
    "correctIndex": 0,
    "explanation": "1 carat = 0.2 gram; 1 × 0.2 = 0.2 gram.",
    "visual": "scale"
  },
  {
    "id": "q050",
    "category": "Weight Practice",
    "question": "1.25 carat gemstone का वजन कितना gram है?",
    "options": [
      "2.5 gram",
      "0.025 gram",
      "0.25 gram"
    ],
    "correctIndex": 2,
    "explanation": "1 carat = 0.2 gram; 1.25 × 0.2 = 0.25 gram.",
    "visual": "scale"
  },
  {
    "id": "q051",
    "category": "Weight Practice",
    "question": "1.5 carat gemstone का वजन कितना gram है?",
    "options": [
      "0.03 gram",
      "0.3 gram",
      "3 gram"
    ],
    "correctIndex": 1,
    "explanation": "1 carat = 0.2 gram; 1.5 × 0.2 = 0.3 gram.",
    "visual": "scale"
  },
  {
    "id": "q052",
    "category": "Weight Practice",
    "question": "2 carat gemstone का वजन कितना gram है?",
    "options": [
      "0.4 gram",
      "4 gram",
      "0.04 gram"
    ],
    "correctIndex": 0,
    "explanation": "1 carat = 0.2 gram; 2 × 0.2 = 0.4 gram.",
    "visual": "scale"
  },
  {
    "id": "q053",
    "category": "Weight Practice",
    "question": "2.5 carat gemstone का वजन कितना gram है?",
    "options": [
      "5 gram",
      "0.05 gram",
      "0.5 gram"
    ],
    "correctIndex": 2,
    "explanation": "1 carat = 0.2 gram; 2.5 × 0.2 = 0.5 gram.",
    "visual": "scale"
  },
  {
    "id": "q054",
    "category": "Weight Practice",
    "question": "3 carat gemstone का वजन कितना gram है?",
    "options": [
      "0.06 gram",
      "0.6 gram",
      "6 gram"
    ],
    "correctIndex": 1,
    "explanation": "1 carat = 0.2 gram; 3 × 0.2 = 0.6 gram.",
    "visual": "scale"
  },
  {
    "id": "q055",
    "category": "Weight Practice",
    "question": "4 carat gemstone का वजन कितना gram है?",
    "options": [
      "0.8 gram",
      "8 gram",
      "0.08 gram"
    ],
    "correctIndex": 0,
    "explanation": "1 carat = 0.2 gram; 4 × 0.2 = 0.8 gram.",
    "visual": "scale"
  },
  {
    "id": "q056",
    "category": "Weight Practice",
    "question": "0.1 gram gemstone कितने carat है?",
    "options": [
      "5 carat",
      "0.05 carat",
      "0.5 carat"
    ],
    "correctIndex": 2,
    "explanation": "1 gram = 5 carat; 0.1 × 5 = 0.5 carat.",
    "visual": "scale"
  },
  {
    "id": "q057",
    "category": "Weight Practice",
    "question": "0.2 gram gemstone कितने carat है?",
    "options": [
      "0.1 carat",
      "1 carat",
      "10 carat"
    ],
    "correctIndex": 1,
    "explanation": "1 gram = 5 carat; 0.2 × 5 = 1 carat.",
    "visual": "scale"
  },
  {
    "id": "q058",
    "category": "Weight Practice",
    "question": "0.4 gram gemstone कितने carat है?",
    "options": [
      "2 carat",
      "20 carat",
      "0.2 carat"
    ],
    "correctIndex": 0,
    "explanation": "1 gram = 5 carat; 0.4 × 5 = 2 carat.",
    "visual": "scale"
  },
  {
    "id": "q059",
    "category": "Weight Practice",
    "question": "0.6 gram gemstone कितने carat है?",
    "options": [
      "30 carat",
      "0.3 carat",
      "3 carat"
    ],
    "correctIndex": 2,
    "explanation": "1 gram = 5 carat; 0.6 × 5 = 3 carat.",
    "visual": "scale"
  },
  {
    "id": "q060",
    "category": "Weight Practice",
    "question": "1 gram gemstone कितने carat है?",
    "options": [
      "0.5 carat",
      "5 carat",
      "50 carat"
    ],
    "correctIndex": 1,
    "explanation": "1 gram = 5 carat; 1 × 5 = 5 carat.",
    "visual": "scale"
  },
  {
    "id": "q061",
    "category": "Customer Handling",
    "question": "Customer का budget तय नहीं है। पहले क्या पूछें?",
    "options": [
      "Occasion और comfortable budget range",
      "सबसे महँगा item दिखाएँ",
      "बात रोक दें"
    ],
    "correctIndex": 0,
    "explanation": "जरूरत और budget समझकर विकल्प देना बेहतर शुरुआत है।",
    "visual": "customer"
  },
  {
    "id": "q062",
    "category": "Customer Handling",
    "question": "Customer gift खरीद रहा है। पहले क्या समझें?",
    "options": [
      "उनका bank PIN",
      "केवल billing address",
      "Recipient, occasion और preference"
    ],
    "correctIndex": 2,
    "explanation": "Gift की suitability समझने के लिए recipient और occasion पूछें।",
    "visual": "man"
  },
  {
    "id": "q063",
    "category": "Customer Handling",
    "question": "Customer कहता है कीमत ज़्यादा है। क्या करें?",
    "options": [
      "बिना अनुमति discount promise करें",
      "Price breakup और alternatives समझाएँ",
      "उसे गलत कहें"
    ],
    "correctIndex": 1,
    "explanation": "Transparent breakup और suitable alternatives मदद करते हैं।",
    "visual": "child"
  },
  {
    "id": "q064",
    "category": "Customer Handling",
    "question": "Customer दो designs में confused है। क्या करें?",
    "options": [
      "Use, comfort और preference पर compare करें",
      "उसकी बात काटें",
      "दोनों खराब कहें"
    ],
    "correctIndex": 0,
    "explanation": "Customer की जरूरत पर तुलना कराएँ।",
    "visual": "cartoon"
  },
  {
    "id": "q065",
    "category": "Customer Handling",
    "question": "Customer return policy पूछता है। सही response?",
    "options": [
      "बिना देखे lifetime return कहें",
      "सवाल टालें",
      "Current written policy verify करके बताएँ"
    ],
    "correctIndex": 2,
    "explanation": "Company policy बदल सकती है; verified written terms ही बताएँ।",
    "visual": "customer"
  },
  {
    "id": "q066",
    "category": "Customer Handling",
    "question": "Customer buyback value पूछता है। क्या करें?",
    "options": [
      "Weight देखे बिना राशि तय करें",
      "Current terms और deductions verify करें",
      "हर हाल में original price promise करें"
    ],
    "correctIndex": 1,
    "explanation": "Unverified buyback promises न करें।",
    "visual": "man"
  },
  {
    "id": "q067",
    "category": "Customer Handling",
    "question": "Customer item की purity पूछता है। क्या दिखाएँ?",
    "options": [
      "Purity mark और relevant details",
      "केवल packaging",
      "अपनी पसंद"
    ],
    "correctIndex": 0,
    "explanation": "Item के actual marks और documentation से समझाएँ।",
    "visual": "child"
  },
  {
    "id": "q068",
    "category": "Customer Handling",
    "question": "Customer Diamond report समझना चाहता है। क्या करें?",
    "options": [
      "Report छिपाएँ",
      "केवल price दोहराएँ",
      "Report के relevant fields सरल भाषा में बताएँ"
    ],
    "correctIndex": 2,
    "explanation": "Weight और quality fields समझाना उपयोगी है।",
    "visual": "cartoon"
  },
  {
    "id": "q069",
    "category": "Customer Handling",
    "question": "Customer ring tight बता रहा है। क्या करें?",
    "options": [
      "Stone निकाल दें",
      "Fit और resizing feasibility check कराएँ",
      "ज़बरदस्ती पहनाएँ"
    ],
    "correctIndex": 1,
    "explanation": "Fit issue पर authorised assessment कराएँ।",
    "visual": "customer"
  },
  {
    "id": "q070",
    "category": "Customer Handling",
    "question": "Customer को sensitive skin है। क्या करें?",
    "options": [
      "Known sensitivities पूछें, material details verify करें",
      "हर item को allergy-free guarantee दें",
      "समस्या नज़रअंदाज़ करें"
    ],
    "correctIndex": 0,
    "explanation": "बिना evidence medical या allergy-free guarantee न दें।",
    "visual": "man"
  },
  {
    "id": "q071",
    "category": "Customer Handling",
    "question": "Customer photo लेना चाहता है। क्या करें?",
    "options": [
      "हर बार मना करें",
      "दूसरे customers की photo लें",
      "Store की current permission policy follow करें"
    ],
    "correctIndex": 2,
    "explanation": "Photography के लिए store policy लागू करें।",
    "visual": "child"
  },
  {
    "id": "q072",
    "category": "Customer Handling",
    "question": "Customer specific item मांगता है जो available नहीं है। क्या करें?",
    "options": [
      "Call काट दें",
      "Availability check और suitable alternative दें",
      "झूठा stock बताएँ"
    ],
    "correctIndex": 1,
    "explanation": "Stock और delivery का verified update दें।",
    "visual": "cartoon"
  },
  {
    "id": "q073",
    "category": "Customer Handling",
    "question": "Customer urgency बताता है। सही कदम?",
    "options": [
      "Realistic timeline verify करें",
      "बिना जाँच same-day promise करें",
      "उनका deadline ignore करें"
    ],
    "correctIndex": 0,
    "explanation": "Delivery commitments availability देखकर दें।",
    "visual": "customer"
  },
  {
    "id": "q074",
    "category": "Customer Handling",
    "question": "Customer complaint करे तो शुरुआत कैसे करें?",
    "options": [
      "बहस करें",
      "दोष लगाएँ",
      "ध्यान से सुनें और issue clarify करें"
    ],
    "correctIndex": 2,
    "explanation": "पहले सुनें और issue स्पष्ट करें।",
    "visual": "man"
  },
  {
    "id": "q075",
    "category": "Customer Handling",
    "question": "Customer पुरानी jewellery exchange करना चाहता है। क्या करें?",
    "options": [
      "किसी भी purity को एक जैसा मानें",
      "Assessment और current exchange terms समझाएँ",
      "देखे बिना final value बोलें"
    ],
    "correctIndex": 1,
    "explanation": "Assessment और verified policy के बाद value बताएँ।",
    "visual": "child"
  },
  {
    "id": "q076",
    "category": "Customer Handling",
    "question": "Customer invoice में confusion बताता है। क्या करें?",
    "options": [
      "Line items और charges explain करें",
      "जल्दी sign करने को कहें",
      "Invoice छिपाएँ"
    ],
    "correctIndex": 0,
    "explanation": "Transparent explanation customer को निर्णय लेने में मदद देती है।",
    "visual": "cartoon"
  },
  {
    "id": "q077",
    "category": "Customer Handling",
    "question": "Customer natural और lab-grown में पूछता है। क्या करें?",
    "options": [
      "दोनों को बिना जाँच natural कहें",
      "सिर्फ size से origin तय करें",
      "Item की disclosed origin verify करके बताएँ"
    ],
    "correctIndex": 2,
    "explanation": "Origin के लिए verified disclosure/documentation देखें।",
    "visual": "customer"
  },
  {
    "id": "q078",
    "category": "Customer Handling",
    "question": "Customer चाहता है chain रोज पहने। क्या पूछें?",
    "options": [
      "Phone unlock code",
      "Lifestyle, length और comfort",
      "Bank password"
    ],
    "correctIndex": 1,
    "explanation": "Daily use के हिसाब से comfort और fastening देखें।",
    "visual": "man"
  },
  {
    "id": "q079",
    "category": "Customer Handling",
    "question": "Customer pendant के लिए chain पूछता है। क्या देखें?",
    "options": [
      "Bail opening, chain fit और suitability",
      "केवल box size",
      "केवल billing date"
    ],
    "correctIndex": 0,
    "explanation": "Pendant bail और chain का fit check करें।",
    "visual": "child"
  },
  {
    "id": "q080",
    "category": "Customer Handling",
    "question": "Customer को bangle size नहीं पता। क्या करें?",
    "options": [
      "Guess final size",
      "सबको एक size दें",
      "Suitable sizing method से measure करें"
    ],
    "correctIndex": 2,
    "explanation": "Measurement से fit की गलती कम होती है।",
    "visual": "cartoon"
  },
  {
    "id": "q081",
    "category": "Customer Handling",
    "question": "Customer cleaning के लिए chemical पूछता है। क्या करें?",
    "options": [
      "किसी भी cleaner की guarantee दें",
      "Stone और treatment के अनुसार care verify करें",
      "हर stone पर bleach कहें"
    ],
    "correctIndex": 1,
    "explanation": "Different stones/treatments को अलग care चाहिए।",
    "visual": "customer"
  },
  {
    "id": "q082",
    "category": "Customer Handling",
    "question": "Customer stone loose महसूस करता है। क्या करें?",
    "options": [
      "Wear रोककर professional inspection कहें",
      "घर पर glue कहें",
      "ज़ोर से shake करें"
    ],
    "correctIndex": 0,
    "explanation": "Loose setting को professional से check कराना सुरक्षित है।",
    "visual": "man"
  },
  {
    "id": "q083",
    "category": "Customer Handling",
    "question": "Customer jewellery लेकर यात्रा करता है। क्या सुझाएँ?",
    "options": [
      "सबको एक साथ रगड़ते रखें",
      "खुले bag में रखें",
      "अलग padded compartments"
    ],
    "correctIndex": 2,
    "explanation": "अलग soft compartments rubbing और impact कम करते हैं।",
    "visual": "child"
  },
  {
    "id": "q084",
    "category": "Customer Handling",
    "question": "Customer size बदलना चाहता है। पहले क्या जाँचें?",
    "options": [
      "काटने को कहें",
      "Design और material की feasibility",
      "हर ring resize हो सकती है कहें"
    ],
    "correctIndex": 1,
    "explanation": "Resizing feasibility design और material पर निर्भर है।",
    "visual": "cartoon"
  },
  {
    "id": "q085",
    "category": "Customer Handling",
    "question": "Customer colour अलग दिखने की बात करे। क्या करें?",
    "options": [
      "Lighting और item details साथ में देखें",
      "उसे गलत कहें",
      "बिना जाँच defective घोषित करें"
    ],
    "correctIndex": 0,
    "explanation": "Lighting और documented details के साथ तुलना करें।",
    "visual": "customer"
  },
  {
    "id": "q086",
    "category": "Customer Handling",
    "question": "Customer privacy के बारे में पूछे। क्या करें?",
    "options": [
      "OTP माँगें",
      "Data group में भेजें",
      "केवल जरूरी details, authorised process में लें"
    ],
    "correctIndex": 2,
    "explanation": "Customer data केवल authorised business process में लें।",
    "visual": "man"
  },
  {
    "id": "q087",
    "category": "Customer Handling",
    "question": "Customer discount मांगता है। क्या करें?",
    "options": [
      "Invoice के बाहर payment कहें",
      "Authorised offers verify करें",
      "अपनी ओर से unlimited promise करें"
    ],
    "correctIndex": 1,
    "explanation": "सिर्फ authorised offer और billing process लागू करें।",
    "visual": "child"
  },
  {
    "id": "q088",
    "category": "Customer Handling",
    "question": "Customer report खोने की बात कहता है। क्या करें?",
    "options": [
      "Issuer / store की replacement process verify करें",
      "नया report खुद बना दें",
      "कोई भी report दे दें"
    ],
    "correctIndex": 0,
    "explanation": "Replacement के लिए issuer / store process follow करें।",
    "visual": "cartoon"
  },
  {
    "id": "q089",
    "category": "Customer Handling",
    "question": "Customer gift recipient का size नहीं जानता। क्या करें?",
    "options": [
      "हर item adjustable कहें",
      "Random size final करें",
      "Sizing और applicable exchange terms समझाएँ"
    ],
    "correctIndex": 2,
    "explanation": "Sizing options और verified exchange terms बताना बेहतर है।",
    "visual": "customer"
  },
  {
    "id": "q090",
    "category": "Customer Handling",
    "question": "Customer नकद और online charges पूछता है। क्या करें?",
    "options": [
      "OTP माँगें",
      "Verified billing/payment terms साफ बताएँ",
      "अलग unrecorded rate दें"
    ],
    "correctIndex": 1,
    "explanation": "Authorised payment terms और invoice स्पष्ट रखें।",
    "visual": "man"
  },
  {
    "id": "q091",
    "category": "Customer Handling",
    "question": "Customer कहता है shine कम लगती है। क्या करें?",
    "options": [
      "Cleanliness और setting की inspection offer करें",
      "Carat बढ़ाने का दावा करें",
      "बिना देखे stone बदलें"
    ],
    "correctIndex": 0,
    "explanation": "पहले cleaning/inspection से कारण समझें।",
    "visual": "child"
  },
  {
    "id": "q092",
    "category": "Customer Handling",
    "question": "Customer को clasp चलाना नहीं आता। क्या करें?",
    "options": [
      "ज़ोर लगाने को कहें",
      "सवाल ignore करें",
      "धीरे demo और secure close दिखाएँ"
    ],
    "correctIndex": 2,
    "explanation": "Fastening का सही उपयोग demonstrate करें।",
    "visual": "cartoon"
  },
  {
    "id": "q093",
    "category": "Customer Handling",
    "question": "Customer दो same-weight items compare करता है। क्या समझाएँ?",
    "options": [
      "हर item का price बराबर है",
      "Purity, design, stones और charges भी देखें",
      "सिर्फ weight पर्याप्त है"
    ],
    "correctIndex": 1,
    "explanation": "Same weight से पूरी product/value तुलना नहीं होती।",
    "visual": "customer"
  },
  {
    "id": "q094",
    "category": "Customer Handling",
    "question": "Customer decision के लिए समय चाहता है। क्या करें?",
    "options": [
      "Details देकर बिना दबाव सोचने दें",
      "जबरदस्ती billing करें",
      "उनकी पसंद का मज़ाक बनाएँ"
    ],
    "correctIndex": 0,
    "explanation": "Respectful, informed choice को support करें।",
    "visual": "man"
  },
  {
    "id": "q095",
    "category": "Customer Handling",
    "question": "Customer hallmark पढ़ नहीं पा रहा। क्या करें?",
    "options": [
      "नंबर invent करें",
      "Mark खुरचें",
      "Magnification और HUID verification में सहायता दें"
    ],
    "correctIndex": 2,
    "explanation": "Actual mark पढ़ने और verify करने में सहायता दें।",
    "visual": "child"
  },
  {
    "id": "q096",
    "category": "Customer Handling",
    "question": "Customer item delivery ले रहा है। क्या करें?",
    "options": [
      "दूसरे का item दें",
      "Item, quantity, invoice और condition साथ check करें",
      "बिना check pack दें"
    ],
    "correctIndex": 1,
    "explanation": "Handover पर item और invoice matching confirm करें।",
    "visual": "cartoon"
  },
  {
    "id": "q097",
    "category": "Customer Handling",
    "question": "Customer बताए कि gemstone treated है। care कैसे बताएँ?",
    "options": [
      "Treatment-specific guidance verify करें",
      "हर treatment को एक जैसा मानें",
      "Steam हमेशा safe कहें"
    ],
    "correctIndex": 0,
    "explanation": "Treatment care needs बदल सकता है; specific guidance देखें।",
    "visual": "customer"
  },
  {
    "id": "q098",
    "category": "Customer Handling",
    "question": "Customer की preference clear नहीं है। क्या करें?",
    "options": [
      "एक साथ बहुत सारे unrelated items दें",
      "बिना पूछे bill बनाएँ",
      "कुछ focused choices से preference समझें"
    ],
    "correctIndex": 2,
    "explanation": "Focused questions और shortlist से चयन आसान होता है।",
    "visual": "man"
  },
  {
    "id": "q099",
    "category": "Customer Handling",
    "question": "Customer repair estimate पूछता है। क्या करें?",
    "options": [
      "बिना consent काम शुरू करें",
      "Inspection के बाद authorised estimate दें",
      "देखे बिना fixed promise करें"
    ],
    "correctIndex": 1,
    "explanation": "Repair scope, cost और consent पहले स्पष्ट करें।",
    "visual": "child"
  },
  {
    "id": "q100",
    "category": "Customer Handling",
    "question": "Customer की बात समझ नहीं आए तो क्या करें?",
    "options": [
      "विनम्रता से clarify करके दोहराएँ",
      "Guess करके final करें",
      "अनसुना करें"
    ],
    "correctIndex": 0,
    "explanation": "Clarification से गलत recommendation कम होती है।",
    "visual": "cartoon"
  }
];
export const GAME_LIBRARY: GameDefinition[] = [
  {
    "id": "pair-1",
    "kind": "pairs",
    "title": "Match the Pair · Diamond Basics",
    "icon": "🔗",
    "pairs": [
      {
        "term": "Carat",
        "meaning": "हीरे का वजन"
      },
      {
        "term": "Karat",
        "meaning": "सोने की शुद्धता"
      },
      {
        "term": "Cut",
        "meaning": "रोशनी से जुड़ी तराश"
      },
      {
        "term": "Clarity",
        "meaning": "Inclusions / blemishes"
      }
    ]
  },
  {
    "id": "pair-2",
    "kind": "pairs",
    "title": "Match the Pair · Gold Marks",
    "icon": "🔗",
    "pairs": [
      {
        "term": "14K",
        "meaning": "585"
      },
      {
        "term": "18K",
        "meaning": "750"
      },
      {
        "term": "22K",
        "meaning": "916"
      },
      {
        "term": "23K",
        "meaning": "958"
      }
    ]
  },
  {
    "id": "pair-3",
    "kind": "pairs",
    "title": "Match the Pair · Jewellery Terms",
    "icon": "🔗",
    "pairs": [
      {
        "term": "Pendant",
        "meaning": "Chain से लटकता ornament"
      },
      {
        "term": "Clasp",
        "meaning": "बंद करने का fastening"
      },
      {
        "term": "Bangle",
        "meaning": "कलाई का ornament"
      },
      {
        "term": "Stud",
        "meaning": "कान के पास बैठता earring"
      }
    ]
  },
  {
    "id": "pair-4",
    "kind": "pairs",
    "title": "Match the Pair · Diamond Shapes",
    "icon": "🔗",
    "pairs": [
      {
        "term": "Pear",
        "meaning": "आंसू जैसा"
      },
      {
        "term": "Oval",
        "meaning": "अंडाकार"
      },
      {
        "term": "Round",
        "meaning": "गोल"
      },
      {
        "term": "Heart",
        "meaning": "दिल जैसा"
      }
    ]
  },
  {
    "id": "pair-5",
    "kind": "pairs",
    "title": "Match the Pair · Weight Pairs",
    "icon": "🔗",
    "pairs": [
      {
        "term": "0.5 carat",
        "meaning": "0.1 gram"
      },
      {
        "term": "1 carat",
        "meaning": "0.2 gram"
      },
      {
        "term": "2 carat",
        "meaning": "0.4 gram"
      },
      {
        "term": "5 carat",
        "meaning": "1 gram"
      }
    ]
  },
  {
    "id": "pair-6",
    "kind": "pairs",
    "title": "Match the Pair · Service Steps",
    "icon": "🔗",
    "pairs": [
      {
        "term": "Budget",
        "meaning": "Comfortable price range पूछें"
      },
      {
        "term": "Fit",
        "meaning": "Size measure करें"
      },
      {
        "term": "Policy",
        "meaning": "Written terms verify करें"
      },
      {
        "term": "Handover",
        "meaning": "Item और invoice match करें"
      }
    ]
  },
  {
    "id": "shape-1",
    "kind": "shape",
    "title": "Shape पहचानो · Set 1",
    "icon": "💎",
    "rounds": [
      {
        "shape": 0,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 0
      },
      {
        "shape": 2,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 2
      },
      {
        "shape": 4,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 4
      }
    ]
  },
  {
    "id": "shape-2",
    "kind": "shape",
    "title": "Shape पहचानो · Set 2",
    "icon": "💎",
    "rounds": [
      {
        "shape": 1,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 1
      },
      {
        "shape": 3,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 3
      },
      {
        "shape": 5,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 5
      }
    ]
  },
  {
    "id": "shape-3",
    "kind": "shape",
    "title": "Shape पहचानो · Set 3",
    "icon": "💎",
    "rounds": [
      {
        "shape": 2,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 2
      },
      {
        "shape": 4,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 4
      },
      {
        "shape": 0,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 0
      }
    ]
  },
  {
    "id": "shape-4",
    "kind": "shape",
    "title": "Shape पहचानो · Set 4",
    "icon": "💎",
    "rounds": [
      {
        "shape": 3,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 3
      },
      {
        "shape": 5,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 5
      },
      {
        "shape": 1,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 1
      }
    ]
  },
  {
    "id": "shape-5",
    "kind": "shape",
    "title": "Shape पहचानो · Set 5",
    "icon": "💎",
    "rounds": [
      {
        "shape": 4,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 4
      },
      {
        "shape": 0,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 0
      },
      {
        "shape": 2,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 2
      }
    ]
  },
  {
    "id": "shape-6",
    "kind": "shape",
    "title": "Shape पहचानो · Set 6",
    "icon": "💎",
    "rounds": [
      {
        "shape": 5,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 5
      },
      {
        "shape": 1,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 1
      },
      {
        "shape": 3,
        "options": [
          "Round",
          "Pear",
          "Oval",
          "Princess",
          "Emerald",
          "Heart"
        ],
        "correctIndex": 3
      }
    ]
  },
  {
    "id": "rapid-1",
    "kind": "rapid",
    "title": "60-second Rapid Fire · Diamond",
    "icon": "⏱️",
    "questionIds": [
      0,
      1,
      2,
      3,
      4
    ]
  },
  {
    "id": "rapid-2",
    "kind": "rapid",
    "title": "60-second Rapid Fire · Gold",
    "icon": "⏱️",
    "questionIds": [
      30,
      31,
      32,
      35,
      36
    ]
  },
  {
    "id": "rapid-3",
    "kind": "rapid",
    "title": "60-second Rapid Fire · Weights",
    "icon": "⏱️",
    "questionIds": [
      45,
      47,
      48,
      51,
      54
    ]
  },
  {
    "id": "rapid-4",
    "kind": "rapid",
    "title": "60-second Rapid Fire · Jewellery",
    "icon": "⏱️",
    "questionIds": [
      18,
      19,
      20,
      21,
      22
    ]
  },
  {
    "id": "rapid-5",
    "kind": "rapid",
    "title": "60-second Rapid Fire · Customer Care",
    "icon": "⏱️",
    "questionIds": [
      60,
      65,
      70,
      75,
      80
    ]
  },
  {
    "id": "rapid-6",
    "kind": "rapid",
    "title": "60-second Rapid Fire · Mixed",
    "icon": "⏱️",
    "questionIds": [
      6,
      25,
      37,
      52,
      99
    ]
  },
  {
    "id": "customer-1",
    "kind": "customer",
    "title": "Customer Challenge · Welcome & Budget",
    "icon": "💬",
    "questionIds": [
      60,
      61,
      62
    ],
    "character": "lady"
  },
  {
    "id": "customer-2",
    "kind": "customer",
    "title": "Customer Challenge · Quality & Trust",
    "icon": "💬",
    "questionIds": [
      66,
      67,
      76
    ],
    "character": "man"
  },
  {
    "id": "customer-3",
    "kind": "customer",
    "title": "Customer Challenge · Fit & Comfort",
    "icon": "💬",
    "questionIds": [
      68,
      77,
      79
    ],
    "character": "child"
  },
  {
    "id": "customer-4",
    "kind": "customer",
    "title": "Customer Challenge · Care & Repair",
    "icon": "💬",
    "questionIds": [
      80,
      81,
      98
    ],
    "character": "cartoon"
  },
  {
    "id": "customer-5",
    "kind": "customer",
    "title": "Customer Challenge · Clear Billing",
    "icon": "💬",
    "questionIds": [
      75,
      84,
      89
    ],
    "character": "lady"
  },
  {
    "id": "customer-6",
    "kind": "customer",
    "title": "Customer Challenge · Confident Handover",
    "icon": "💬",
    "questionIds": [
      90,
      95,
      99
    ],
    "character": "man"
  },
  {
    "id": "memory-1",
    "kind": "memory",
    "title": "Memory Match · Gold Favourites",
    "icon": "🃏",
    "items": [
      0,
      4,
      5,
      7
    ]
  },
  {
    "id": "memory-2",
    "kind": "memory",
    "title": "Memory Match · Sparkle Picks",
    "icon": "🃏",
    "items": [
      1,
      2,
      6,
      9
    ]
  },
  {
    "id": "memory-3",
    "kind": "memory",
    "title": "Memory Match · Ring & Pendant",
    "icon": "🃏",
    "items": [
      0,
      1,
      9,
      10
    ]
  },
  {
    "id": "memory-4",
    "kind": "memory",
    "title": "Memory Match · Earring Collection",
    "icon": "🃏",
    "items": [
      2,
      3,
      7,
      11
    ]
  },
  {
    "id": "memory-5",
    "kind": "memory",
    "title": "Memory Match · Necklace Mix",
    "icon": "🃏",
    "items": [
      5,
      6,
      8,
      10
    ]
  },
  {
    "id": "memory-6",
    "kind": "memory",
    "title": "Memory Match · Jewellery Master",
    "icon": "🃏",
    "items": [
      0,
      2,
      4,
      6,
      8,
      11
    ]
  },
  {
    "id": "design-identify-1",
    "kind": "design",
    "title": "Design पहचानो",
    "icon": "🧩",
    "art": "designMan",
    "rounds": [
      {
        "question": "यह कौन-सी jewellery है?",
        "options": [
          "Jhumka",
          "Bangle",
          "Pendant"
        ],
        "correctIndex": 0,
        "jewellery": 7
      },
      {
        "question": "यह कौन-सी jewellery है?",
        "options": [
          "Necklace",
          "Ring",
          "Chain"
        ],
        "correctIndex": 1,
        "jewellery": 0
      },
      {
        "question": "यह कौन-सी jewellery है?",
        "options": [
          "Bangle",
          "Studs",
          "Pendant"
        ],
        "correctIndex": 2,
        "jewellery": 6
      }
    ]
  },
  {
    "id": "correct-order-1",
    "kind": "sequence",
    "title": "सही क्रम लगाओ",
    "icon": "📋",
    "art": "orderWoman",
    "steps": [
      "स्वागत करें",
      "ज़रूरत समझें",
      "विकल्प दिखाएँ",
      "Item और invoice check करें"
    ]
  },
  {
    "id": "choose-jewellery-1",
    "kind": "selection",
    "title": "सही Jewellery चुनो",
    "icon": "🎁",
    "art": "customerWoman",
    "rounds": [
      {
        "question": "Daily wear के लिए हल्की earrings चाहिए। सबसे suitable option चुनें।",
        "options": [
          "Heavy bridal jhumka",
          "Light studs",
          "Long chandelier earrings"
        ],
        "correctIndex": 1,
        "art": "customerWoman",
        "imageChoices": [
          "heavyEarrings",
          "lightStuds",
          "longEarrings"
        ]
      },
      {
        "question": "Customer को chain से लटकने वाला ornament चाहिए। कौन-सा दिखाएँ?",
        "options": [
          "Bangle",
          "Pendant",
          "Studs"
        ],
        "correctIndex": 1,
        "art": "customerWoman",
        "jewelleryChoices": [
          4,
          6,
          2
        ]
      },
      {
        "question": "Customer को कलाई के लिए jewellery चाहिए। क्या दिखाएँ?",
        "options": [
          "Bangle",
          "Pendant",
          "Earrings"
        ],
        "correctIndex": 0,
        "art": "customerWoman",
        "jewelleryChoices": [
          4,
          6,
          7
        ]
      }
    ]
  },
  {
    "id": "repair-detective-1",
    "kind": "repair",
    "title": "Repair Detective",
    "icon": "🛠️",
    "art": "thinkingMan",
    "rounds": [
      {
        "question": "Stone loose है। अगला सही कदम?",
        "options": [
          "Inspection के लिए दें",
          "घर पर glue लगाएँ",
          "पहनते रहें"
        ],
        "correctIndex": 0,
        "art": "repairPhoto"
      },
      {
        "question": "Loose setting में stone को खुद दबाकर कसना चाहिए?",
        "options": [
          "हाँ, force से",
          "नहीं, professional से check कराएँ",
          "केवल shake करें"
        ],
        "correctIndex": 1,
        "art": "repairPhoto"
      },
      {
        "question": "Repair शुरू करने से पहले क्या स्पष्ट होना चाहिए?",
        "options": [
          "केवल box colour",
          "बिना consent काम करें",
          "Assessment, estimate और customer consent"
        ],
        "correctIndex": 2,
        "art": "repairPhoto"
      }
    ]
  },
  {
    "id": "care-challenge-1",
    "kind": "care",
    "title": "Care Challenge",
    "icon": "🧼",
    "art": "pearlPhoto",
    "rounds": [
      {
        "question": "Pearl necklace कैसे रखें?",
        "options": [
          "अलग soft pouch में",
          "दूसरी jewellery के साथ ढेर में",
          "खुले hard box में"
        ],
        "correctIndex": 0,
        "art": "pearlPhoto",
        "imageChoices": ["softPouch", "mixedStorage", "hardBox"]
      },
      {
        "question": "Pearls को routine wear के बाद किससे साफ करें?",
        "options": [
          "कठोर brush",
          "बहुत soft, साफ cloth",
          "तेज़ chemical"
        ],
        "correctIndex": 1,
        "art": "pearlPhoto"
      },
      {
        "question": "Pearls के लिए क्या avoid करना चाहिए?",
        "options": [
          "Soft pouch",
          "Soft cloth",
          "Ultrasonic और steam cleaner"
        ],
        "correctIndex": 2,
        "art": "pearlPhoto"
      }
    ]
  },
  {
    "id": "safe-risk-1",
    "kind": "risk",
    "title": "Safe या Risky?",
    "icon": "🛡️",
    "art": "mixedTray",
    "rounds": [
      {
        "question": "Pieces को इस तरह आपस में छूते हुए रखना?",
        "options": [
          "Safe",
          "Risky"
        ],
        "correctIndex": 1,
        "art": "mixedTray"
      },
      {
        "question": "इसी tray के pieces को अलग padded compartments में रखना?",
        "options": [
          "Safe",
          "Risky"
        ],
        "correctIndex": 0,
        "art": "mixedTray"
      },
      {
        "question": "इस tray को बिना cover के झटके देकर ले जाना?",
        "options": [
          "Safe",
          "Risky"
        ],
        "correctIndex": 1,
        "art": "mixedTray"
      }
    ]
  },
  {
    "id": "find-error-1",
    "kind": "error",
    "title": "गलती पकड़ो",
    "icon": "🔍",
    "art": "detectiveWoman",
    "rounds": [
      {
        "question": "DEMO TAG: गलत detail पर tap करें।",
        "options": [
          "Gold purity: 18K",
          "Fineness: 916",
          "Weight: 8.00 g"
        ],
        "correctIndex": 1,
        "art": "detectiveWoman",
        "facts": [
          "Gold purity: 18K",
          "Fineness: 916",
          "Weight: 8.00 g"
        ]
      },
      {
        "question": "DEMO TAG: Gross − stone = net. गलत detail चुनें।",
        "options": [
          "Gross weight: 12.00 g",
          "Stone weight: 2.00 g",
          "Net metal: 11.00 g"
        ],
        "correctIndex": 2,
        "art": "detectiveWoman",
        "facts": [
          "Gross weight: 12.00 g",
          "Stone weight: 2.00 g",
          "Net metal: 11.00 g"
        ]
      },
      {
        "question": "DEMO TAG: गलत conversion चुनें।",
        "options": [
          "Gem weight: 1 carat",
          "Equivalent: 2.0 gram",
          "Unit: carat (ct)"
        ],
        "correctIndex": 1,
        "art": "detectiveWoman",
        "facts": [
          "Gem weight: 1 carat",
          "Equivalent: 2.0 gram",
          "Unit: carat (ct)"
        ]
      }
    ]
  },
  {
    "id": "weight-guess-1",
    "kind": "weight",
    "title": "वजन का अंदाज़ा",
    "icon": "⚖️",
    "art": "scale",
    "rounds": [
      {
        "question": "2 carat = ? gram",
        "options": [
          "0.2 g",
          "0.4 g",
          "2.0 g",
          "4.0 g"
        ],
        "correctIndex": 1,
        "art": "scale"
      },
      {
        "question": "0.5 carat = ? gram",
        "options": [
          "0.1 g",
          "0.5 g",
          "1.0 g",
          "5.0 g"
        ],
        "correctIndex": 0,
        "art": "scale"
      },
      {
        "question": "1 gram = ? carat",
        "options": [
          "1 ct",
          "2 ct",
          "5 ct",
          "10 ct"
        ],
        "correctIndex": 2,
        "art": "scale"
      },
      {
        "question": "1.5 carat = ? gram",
        "options": [
          "1.5 g",
          "3.0 g",
          "0.15 g",
          "0.3 g"
        ],
        "correctIndex": 3,
        "art": "scale"
      },
      {
        "question": "0.4 gram = ? carat",
        "options": [
          "0.4 ct",
          "2 ct",
          "4 ct",
          "20 ct"
        ],
        "correctIndex": 1,
        "art": "scale"
      }
    ]
  }
];
