export type ShapeCutCategory = 'Basic' | 'Geometric' | 'Stars & Symbols' | 'Nature & Flowers' | 'Organic Blobs' | 'Frames & Arches' | 'Creative'
export type ShapeCutTemplate = { id: string; name: string; category: ShapeCutCategory; kind: number; index: number }

export const SHAPECUT_CATEGORIES: ShapeCutCategory[] = ["Basic","Geometric","Stars & Symbols","Nature & Flowers","Organic Blobs","Frames & Arches","Creative"]
export const SHAPECUT_SHAPES: ShapeCutTemplate[] = [
  {
    "id": "sc-001",
    "name": "Circle",
    "category": "Basic",
    "kind": 0,
    "index": 0
  },
  {
    "id": "sc-002",
    "name": "Oval",
    "category": "Basic",
    "kind": 0,
    "index": 1
  },
  {
    "id": "sc-003",
    "name": "Rounded Square",
    "category": "Basic",
    "kind": 0,
    "index": 2
  },
  {
    "id": "sc-004",
    "name": "Square",
    "category": "Basic",
    "kind": 0,
    "index": 3
  },
  {
    "id": "sc-005",
    "name": "Rounded Rectangle",
    "category": "Basic",
    "kind": 0,
    "index": 4
  },
  {
    "id": "sc-006",
    "name": "Vertical Rectangle",
    "category": "Basic",
    "kind": 0,
    "index": 5
  },
  {
    "id": "sc-007",
    "name": "Horizontal Rectangle",
    "category": "Basic",
    "kind": 0,
    "index": 6
  },
  {
    "id": "sc-008",
    "name": "Capsule",
    "category": "Basic",
    "kind": 0,
    "index": 7
  },
  {
    "id": "sc-009",
    "name": "Pill",
    "category": "Basic",
    "kind": 0,
    "index": 8
  },
  {
    "id": "sc-010",
    "name": "Vertical Ellipse",
    "category": "Basic",
    "kind": 0,
    "index": 9
  },
  {
    "id": "sc-011",
    "name": "Horizontal Ellipse",
    "category": "Basic",
    "kind": 0,
    "index": 10
  },
  {
    "id": "sc-012",
    "name": "Soft-Corner Square",
    "category": "Basic",
    "kind": 0,
    "index": 11
  },
  {
    "id": "sc-013",
    "name": "Soft-Corner Rectangle",
    "category": "Basic",
    "kind": 0,
    "index": 12
  },
  {
    "id": "sc-014",
    "name": "Diamond",
    "category": "Basic",
    "kind": 0,
    "index": 13
  },
  {
    "id": "sc-015",
    "name": "Half Circle",
    "category": "Basic",
    "kind": 0,
    "index": 14
  },
  {
    "id": "sc-016",
    "name": "Equilateral Triangle",
    "category": "Geometric",
    "kind": 1,
    "index": 0
  },
  {
    "id": "sc-017",
    "name": "Inverted Triangle",
    "category": "Geometric",
    "kind": 1,
    "index": 1
  },
  {
    "id": "sc-018",
    "name": "Right Triangle",
    "category": "Geometric",
    "kind": 1,
    "index": 2
  },
  {
    "id": "sc-019",
    "name": "Pentagon",
    "category": "Geometric",
    "kind": 1,
    "index": 3
  },
  {
    "id": "sc-020",
    "name": "Hexagon",
    "category": "Geometric",
    "kind": 1,
    "index": 4
  },
  {
    "id": "sc-021",
    "name": "Heptagon",
    "category": "Geometric",
    "kind": 1,
    "index": 5
  },
  {
    "id": "sc-022",
    "name": "Octagon",
    "category": "Geometric",
    "kind": 1,
    "index": 6
  },
  {
    "id": "sc-023",
    "name": "Nonagon",
    "category": "Geometric",
    "kind": 1,
    "index": 7
  },
  {
    "id": "sc-024",
    "name": "Decagon",
    "category": "Geometric",
    "kind": 1,
    "index": 8
  },
  {
    "id": "sc-025",
    "name": "Tall Diamond",
    "category": "Geometric",
    "kind": 1,
    "index": 9
  },
  {
    "id": "sc-026",
    "name": "Wide Diamond",
    "category": "Geometric",
    "kind": 1,
    "index": 10
  },
  {
    "id": "sc-027",
    "name": "Parallelogram",
    "category": "Geometric",
    "kind": 1,
    "index": 11
  },
  {
    "id": "sc-028",
    "name": "Trapezoid",
    "category": "Geometric",
    "kind": 1,
    "index": 12
  },
  {
    "id": "sc-029",
    "name": "Inverted Trapezoid",
    "category": "Geometric",
    "kind": 1,
    "index": 13
  },
  {
    "id": "sc-030",
    "name": "Kite",
    "category": "Geometric",
    "kind": 1,
    "index": 14
  },
  {
    "id": "sc-031",
    "name": "Rhombus",
    "category": "Geometric",
    "kind": 1,
    "index": 15
  },
  {
    "id": "sc-032",
    "name": "Chevron",
    "category": "Geometric",
    "kind": 1,
    "index": 16
  },
  {
    "id": "sc-033",
    "name": "Right Arrow",
    "category": "Geometric",
    "kind": 1,
    "index": 17
  },
  {
    "id": "sc-034",
    "name": "Left Arrow",
    "category": "Geometric",
    "kind": 1,
    "index": 18
  },
  {
    "id": "sc-035",
    "name": "Geometric Cross",
    "category": "Geometric",
    "kind": 1,
    "index": 19
  },
  {
    "id": "sc-036",
    "name": "Five-Point Star",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 0
  },
  {
    "id": "sc-037",
    "name": "Six-Point Star",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 1
  },
  {
    "id": "sc-038",
    "name": "Eight-Point Star",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 2
  },
  {
    "id": "sc-039",
    "name": "Twelve-Point Star",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 3
  },
  {
    "id": "sc-040",
    "name": "Four-Point Spark",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 4
  },
  {
    "id": "sc-041",
    "name": "Six-Point Spark",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 5
  },
  {
    "id": "sc-042",
    "name": "Heart",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 6
  },
  {
    "id": "sc-043",
    "name": "Double Heart",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 7
  },
  {
    "id": "sc-044",
    "name": "Crescent Moon",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 8
  },
  {
    "id": "sc-045",
    "name": "Lightning Bolt",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 9
  },
  {
    "id": "sc-046",
    "name": "Plus Sign",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 10
  },
  {
    "id": "sc-047",
    "name": "X Shape",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 11
  },
  {
    "id": "sc-048",
    "name": "Speech Bubble",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 12
  },
  {
    "id": "sc-049",
    "name": "Thought Bubble",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 13
  },
  {
    "id": "sc-050",
    "name": "Sun Symbol",
    "category": "Stars & Symbols",
    "kind": 2,
    "index": 14
  },
  {
    "id": "sc-051",
    "name": "Five-Petal Flower",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 0
  },
  {
    "id": "sc-052",
    "name": "Six-Petal Flower",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 1
  },
  {
    "id": "sc-053",
    "name": "Eight-Petal Flower",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 2
  },
  {
    "id": "sc-054",
    "name": "Daisy",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 3
  },
  {
    "id": "sc-055",
    "name": "Rose-Inspired Silhouette",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 4
  },
  {
    "id": "sc-056",
    "name": "Four-Leaf Clover",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 5
  },
  {
    "id": "sc-057",
    "name": "Leaf",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 6
  },
  {
    "id": "sc-058",
    "name": "Pointed Leaf",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 7
  },
  {
    "id": "sc-059",
    "name": "Rounded Leaf",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 8
  },
  {
    "id": "sc-060",
    "name": "Sunflower-Inspired Silhouette",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 9
  },
  {
    "id": "sc-061",
    "name": "Cloud",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 10
  },
  {
    "id": "sc-062",
    "name": "Rain Cloud",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 11
  },
  {
    "id": "sc-063",
    "name": "Wave",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 12
  },
  {
    "id": "sc-064",
    "name": "Water Drop",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 13
  },
  {
    "id": "sc-065",
    "name": "Flame",
    "category": "Nature & Flowers",
    "kind": 3,
    "index": 14
  },
  {
    "id": "sc-066",
    "name": "Soft Organic Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 0
  },
  {
    "id": "sc-067",
    "name": "Rounded Organic Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 1
  },
  {
    "id": "sc-068",
    "name": "Asymmetric Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 2
  },
  {
    "id": "sc-069",
    "name": "Petal Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 3
  },
  {
    "id": "sc-070",
    "name": "Cloud Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 4
  },
  {
    "id": "sc-071",
    "name": "Pebble Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 5
  },
  {
    "id": "sc-072",
    "name": "Flowing Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 6
  },
  {
    "id": "sc-073",
    "name": "Ripple Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 7
  },
  {
    "id": "sc-074",
    "name": "Wide Organic Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 8
  },
  {
    "id": "sc-075",
    "name": "Tall Organic Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 9
  },
  {
    "id": "sc-076",
    "name": "Squircle Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 10
  },
  {
    "id": "sc-077",
    "name": "Five-Lobe Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 11
  },
  {
    "id": "sc-078",
    "name": "Six-Lobe Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 12
  },
  {
    "id": "sc-079",
    "name": "Droplet Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 13
  },
  {
    "id": "sc-080",
    "name": "Twist Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 14
  },
  {
    "id": "sc-081",
    "name": "Smooth Amoeba",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 15
  },
  {
    "id": "sc-082",
    "name": "Soft Star Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 16
  },
  {
    "id": "sc-083",
    "name": "Double-Bulge Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 17
  },
  {
    "id": "sc-084",
    "name": "Abstract Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 18
  },
  {
    "id": "sc-085",
    "name": "Freeform Blob",
    "category": "Organic Blobs",
    "kind": 4,
    "index": 19
  },
  {
    "id": "sc-086",
    "name": "Classic Arch",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 0
  },
  {
    "id": "sc-087",
    "name": "Tall Arch",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 1
  },
  {
    "id": "sc-088",
    "name": "Wide Arch",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 2
  },
  {
    "id": "sc-089",
    "name": "Rounded Arch",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 3
  },
  {
    "id": "sc-090",
    "name": "Pointed Arch",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 4
  },
  {
    "id": "sc-091",
    "name": "Gothic Arch",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 5
  },
  {
    "id": "sc-092",
    "name": "Oval Frame Shape",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 6
  },
  {
    "id": "sc-093",
    "name": "Ticket Shape",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 7
  },
  {
    "id": "sc-094",
    "name": "Scalloped Frame",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 8
  },
  {
    "id": "sc-095",
    "name": "Wavy Frame",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 9
  },
  {
    "id": "sc-096",
    "name": "Rounded Polaroid Window",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 10
  },
  {
    "id": "sc-097",
    "name": "Film Frame",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 11
  },
  {
    "id": "sc-098",
    "name": "Postage Stamp Shape",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 12
  },
  {
    "id": "sc-099",
    "name": "Double-Arch Silhouette",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 13
  },
  {
    "id": "sc-100",
    "name": "Inset Rounded Frame Shape",
    "category": "Frames & Arches",
    "kind": 5,
    "index": 14
  },
  {
    "id": "sc-101",
    "name": "Speech Bubble Left",
    "category": "Creative",
    "kind": 6,
    "index": 0
  },
  {
    "id": "sc-102",
    "name": "Speech Bubble Right",
    "category": "Creative",
    "kind": 6,
    "index": 1
  },
  {
    "id": "sc-103",
    "name": "Rounded Comic Bubble",
    "category": "Creative",
    "kind": 6,
    "index": 2
  },
  {
    "id": "sc-104",
    "name": "Jagged Comic Burst",
    "category": "Creative",
    "kind": 6,
    "index": 3
  },
  {
    "id": "sc-105",
    "name": "Explosion Burst",
    "category": "Creative",
    "kind": 6,
    "index": 4
  },
  {
    "id": "sc-106",
    "name": "Wavy Rectangle",
    "category": "Creative",
    "kind": 6,
    "index": 5
  },
  {
    "id": "sc-107",
    "name": "Wavy Circle",
    "category": "Creative",
    "kind": 6,
    "index": 6
  },
  {
    "id": "sc-108",
    "name": "Irregular Polygon",
    "category": "Creative",
    "kind": 6,
    "index": 7
  },
  {
    "id": "sc-109",
    "name": "Abstract Ribbon Silhouette",
    "category": "Creative",
    "kind": 6,
    "index": 8
  },
  {
    "id": "sc-110",
    "name": "Ticket Stub",
    "category": "Creative",
    "kind": 6,
    "index": 9
  },
  {
    "id": "sc-111",
    "name": "Badge Shape",
    "category": "Creative",
    "kind": 6,
    "index": 10
  },
  {
    "id": "sc-112",
    "name": "Seal Shape",
    "category": "Creative",
    "kind": 6,
    "index": 11
  },
  {
    "id": "sc-113",
    "name": "Cloud Burst",
    "category": "Creative",
    "kind": 6,
    "index": 12
  },
  {
    "id": "sc-114",
    "name": "Horizontal Wave Cutout",
    "category": "Creative",
    "kind": 6,
    "index": 13
  },
  {
    "id": "sc-115",
    "name": "Vertical Wave Cutout",
    "category": "Creative",
    "kind": 6,
    "index": 14
  },
  {
    "id": "sc-116",
    "name": "Double Circle Silhouette",
    "category": "Creative",
    "kind": 6,
    "index": 15
  },
  {
    "id": "sc-117",
    "name": "Overlapping Circle Silhouette",
    "category": "Creative",
    "kind": 6,
    "index": 16
  },
  {
    "id": "sc-118",
    "name": "Rounded Cross Silhouette",
    "category": "Creative",
    "kind": 6,
    "index": 17
  },
  {
    "id": "sc-119",
    "name": "Abstract Corner-Cut Rectangle",
    "category": "Creative",
    "kind": 6,
    "index": 18
  },
  {
    "id": "sc-120",
    "name": "Artistic Asymmetric Frame",
    "category": "Creative",
    "kind": 6,
    "index": 19
  }
]

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const polygon = (points: Array<[number,number]>) => 'M ' + points.map(([x,y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ') + ' Z'
const regularPolygon = (count:number, rx=42, ry=42, offset=-Math.PI/2) => Array.from({length:count},(_,i)=>[50+Math.cos(offset+i*Math.PI*2/count)*rx,50+Math.sin(offset+i*Math.PI*2/count)*ry] as [number,number])
const star = (points:number, outer=44, inner=20, offset=-Math.PI/2) => Array.from({length:points*2},(_,i)=>{const r=i%2?inner:outer;const a=offset+i*Math.PI/points;return [50+Math.cos(a)*r,50+Math.sin(a)*r] as [number,number]})

/** Returns a stable vector silhouette for a ShapeCut template. All coordinates use a 100×100 viewBox. */
function getShapeCutPathRaw(shapeId:string):string {
 const s=SHAPECUT_SHAPES.find(item=>item.id===shapeId) ?? SHAPECUT_SHAPES[0]
 const i=s.index
 if(s.category==='Basic') {
  const paths=[
   'M50 5 A45 45 0 1 1 49.99 5 Z','M50 4 C75 4 94 23 94 50 C94 77 75 96 50 96 C25 96 6 77 6 50 C6 23 25 4 50 4 Z',
   'M23 5 H77 Q95 5 95 23 V77 Q95 95 77 95 H23 Q5 95 5 77 V23 Q5 5 23 5 Z','M10 10 H90 V90 H10 Z','M20 5 H80 Q95 5 95 20 V80 Q95 95 80 95 H20 Q5 95 5 80 V20 Q5 5 20 5 Z',
   'M18 5 H82 Q95 5 95 18 V82 Q95 95 82 95 H18 Q5 95 5 82 V18 Q5 5 18 5 Z','M5 20 Q5 5 20 5 H80 Q95 5 95 20 V80 Q95 95 80 95 H20 Q5 95 5 80 Z',
   'M50 4 C76 4 96 24 96 50 C96 76 76 96 50 96 C24 96 4 76 4 50 C4 24 24 4 50 4 Z','M18 5 H82 Q95 5 95 18 V82 Q95 95 82 95 H18 Q5 95 5 82 V18 Q5 5 18 5 Z',
   'M50 3 C73 3 91 24 91 50 C91 76 73 97 50 97 C27 97 9 76 9 50 C9 24 27 3 50 3 Z','M5 50 C5 25 25 5 50 5 C75 5 95 25 95 50 C95 75 75 95 50 95 C25 95 5 75 5 50 Z',
   'M25 4 H75 Q96 4 96 25 V75 Q96 96 75 96 H25 Q4 96 4 75 V25 Q4 4 25 4 Z','M16 5 H84 Q95 5 95 16 V84 Q95 95 84 95 H16 Q5 95 5 84 V16 Q5 5 16 5 Z',
   polygon([[50,3],[97,50],[50,97],[3,50]]),'M5 50 A45 45 0 0 1 95 50 Z'
  ];return paths[i]
 }
 if(s.category==='Geometric') {
  if(i===0)return polygon(regularPolygon(3,46,44,-Math.PI/2)); if(i===1)return polygon(regularPolygon(3,46,44,Math.PI/2)); if(i===2)return polygon([[5,5],[95,95],[5,95]]);
  if(i>=3&&i<=8)return polygon(regularPolygon(i+2,44,44,-Math.PI/2));
  if(i===9)return polygon([[50,2],[83,50],[50,98],[17,50]]); if(i===10)return polygon([[50,12],[96,50],[50,88],[4,50]]);
  if(i===11)return polygon([[24,8],[96,8],[76,92],[4,92]]);if(i===12)return polygon([[20,8],[80,8],[96,92],[4,92]]);if(i===13)return polygon([[4,8],[96,8],[80,92],[20,92]]);
  if(i===14)return polygon([[50,2],[94,35],[65,95],[35,95],[6,35]]);if(i===15)return polygon([[50,3],[97,50],[50,97],[3,50]]);
  if(i===16)return polygon([[5,30],[70,30],[70,10],[98,50],[70,90],[70,70],[5,70]]);if(i===17)return polygon([[4,28],[68,28],[68,8],[98,50],[68,92],[68,72],[4,72]]);if(i===18)return polygon([[96,28],[32,28],[32,8],[2,50],[32,92],[32,72],[96,72]]);
  return polygon([[32,5],[68,5],[68,32],[95,32],[95,68],[68,68],[68,95],[32,95],[32,68],[5,68],[5,32],[32,32]])
 }
 if(s.category==='Stars & Symbols') {
  if(i===0)return polygon(star(5)); if(i===1)return polygon(star(6)); if(i===2)return polygon(star(8)); if(i===3)return polygon(star(12,46,37)); if(i===4)return polygon(star(4,46,8));if(i===5)return polygon(star(6,46,13));
  if(i===6)return 'M50 91 C43 84 7 59 7 31 C7 7 38 1 50 25 C62 1 93 7 93 31 C93 59 57 84 50 91 Z';
  if(i===7)return 'M50 88 C44 80 15 62 15 39 C15 19 37 13 50 30 C63 13 85 19 85 39 C85 62 56 80 50 88 Z';
  if(i===8)return 'M69 7 A43 43 0 1 0 93 71 A34 34 0 0 1 69 7 Z'; if(i===9)return polygon([[57,2],[19,57],[43,57],[32,98],[82,38],[56,38]]);
  if(i===10)return polygon([[38,4],[62,4],[62,38],[96,38],[96,62],[62,62],[62,96],[38,96],[38,62],[4,62],[4,38],[38,38]]);if(i===11)return polygon([[30,5],[50,25],[70,5],[95,30],[75,50],[95,70],[70,95],[50,75],[30,95],[5,70],[25,50],[5,30]]);
  if(i===12||i===13)return 'M8 8 H82 Q95 8 95 21 V65 Q95 78 82 78 H52 L30 96 V78 H18 Q5 78 5 65 V21 Q5 8 18 8 Z'; return polygon(star(16,46,30))
 }
 if(s.category==='Nature & Flowers') {
  if(i<=3||i===5||i===9){const petals=i===0?5:i===1?6:i===2?8:i===3?12:i===5?4:16;const pts=[];for(let j=0;j<petals*2;j++){const a=-Math.PI/2+j*Math.PI/petals;const r=j%2?24:45;pts.push([50+Math.cos(a)*r,50+Math.sin(a)*r] as [number,number])}return polygon(pts)}
  if(i===4)return 'M50 8 C24 12 9 33 20 53 C27 66 38 76 50 92 C62 76 73 66 80 53 C91 33 76 12 50 8 Z';
  if(i>=6&&i<=8)return 'M8 50 C24 13 63 2 92 8 C88 43 60 82 8 50 Z';
  if(i===10||i===11)return 'M6 57 C6 35 26 24 39 31 C46 5 75 5 81 30 C103 29 105 61 86 67 H22 Q6 67 6 57 Z';if(i===12)return 'M2 50 Q14 20 26 50 T50 50 T74 50 T98 50 V100 H2 Z';if(i===13)return 'M50 2 C39 20 16 44 16 63 A34 34 0 0 0 84 63 C84 44 61 20 50 2 Z';return 'M50 3 C37 23 12 44 17 66 C23 91 49 100 67 83 C84 67 77 49 62 37 C64 57 46 64 42 50 C37 37 47 23 50 3 Z'
 }
 if(s.category==='Organic Blobs') {
  // Smooth closed quadratic silhouettes with deterministic variation per template.
  const count = 12
  const points = Array.from({ length: count }, (_, pointIndex) => {
   const angle = -Math.PI / 2 + pointIndex * Math.PI * 2 / count
   const wave = Math.sin((pointIndex + 1) * (i + 2) * 0.37) * 5
   const secondary = Math.cos((pointIndex + 2) * (i + 1) * 0.19) * 3
   const radius = 34 + ((pointIndex * 7 + i * 11) % 13) + wave + secondary
   const x = clamp(50 + Math.cos(angle) * radius * (i % 3 === 0 ? 1.08 : 1), 4, 96)
   const y = clamp(50 + Math.sin(angle) * radius * (i % 4 === 0 ? 0.88 : 1), 4, 96)
   return [x, y] as [number, number]
  })
  const midpoint = (a:[number,number], b:[number,number]):[number,number] => [(a[0]+b[0])/2,(a[1]+b[1])/2]
  const first = midpoint(points[points.length-1], points[0])
  let path = `M ${first[0].toFixed(2)} ${first[1].toFixed(2)}`
  for (let pointIndex=0; pointIndex<points.length; pointIndex++) {
   const current = points[pointIndex]
   const next = points[(pointIndex+1)%points.length]
   const mid = midpoint(current,next)
   path += ` Q ${current[0].toFixed(2)} ${current[1].toFixed(2)} ${mid[0].toFixed(2)} ${mid[1].toFixed(2)}`
  }
  return path + ' Z'
 }
 if(s.category==='Frames & Arches') {
  const arch=['M5 95 V48 A45 45 0 0 1 95 48 V95 Z','M15 95 V35 A35 35 0 0 1 85 35 V95 Z','M3 95 V65 A47 47 0 0 1 97 65 V95 Z','M8 95 V44 Q8 5 50 5 Q92 5 92 44 V95 Z','M5 95 V45 L50 3 L95 45 V95 Z','M8 95 V45 L50 5 L92 45 V95 Z','M50 4 A44 44 0 1 1 49.9 4 Z','M8 20 L20 8 H80 L92 20 V80 L80 92 H20 L8 80 Z','M5 25 Q15 5 25 25 T45 25 T65 25 T85 25 T95 25 V75 Q85 95 75 75 T55 75 T35 75 T15 75 T5 75 Z','M5 18 Q25 8 45 18 T85 18 L95 82 Q75 92 55 82 T15 82 L5 18 Z','M12 8 H88 Q94 8 94 14 V92 H6 V14 Q6 8 12 8 Z','M4 20 H96 V80 H4 Z','M5 20 L15 5 H85 L95 20 V80 L85 95 H15 L5 80 Z','M5 95 V50 A30 30 0 0 1 50 25 A30 30 0 0 1 95 50 V95 Z','M12 12 H88 V88 H12 Z'];return arch[i]
 }
 const patterns: Array<Array<[number,number]>>=[[[10,15],[78,7],[92,40],[75,55],[90,90],[38,82],[7,65]],[[5,35],[22,5],[47,18],[80,3],[95,42],[70,60],[82,92],[30,85]],[[12,8],[55,3],[64,28],[95,22],[84,58],[98,84],[45,93],[23,67],[3,38]],[[5,10],[92,18],[78,47],[97,77],[50,91],[31,70],[3,83],[18,42]],[[50,2],[71,23],[97,16],[83,45],[98,65],[68,68],[74,97],[47,79],[23,97],[31,65],[3,54],[28,36],[9,13]]];
 if(i===0)return 'M5 12 H70 Q94 12 94 36 V67 Q94 86 72 86 H42 L24 98 V86 H15 Q5 86 5 76 Z';if(i===1)return 'M6 12 H85 Q95 12 95 22 V76 Q95 86 85 86 H60 L76 98 L43 86 H16 Q6 86 6 76 Z';if(i===2)return 'M20 5 H80 Q95 5 95 20 V60 Q95 75 80 75 H58 L45 95 L42 75 H20 Q5 75 5 60 V20 Q5 5 20 5 Z';if(i===3||i===4||i===12)return polygon(star(i===3?12:i===4?16:10,46,31));if(i===5)return 'M14 5 H86 Q96 5 91 18 Q83 32 93 45 Q83 58 92 72 Q96 95 82 95 H18 Q4 95 8 78 Q17 64 7 50 Q17 36 7 22 Q4 5 14 5 Z';if(i===6)return 'M8 18 Q50 4 92 18 Q98 50 92 82 Q50 96 8 82 Q2 50 8 18 Z';if(i===7)return polygon(regularPolygon(7,44,42,-Math.PI/2+i*.13));if(i===8)return polygon([[8,15],[92,15],[74,50],[92,85],[8,85],[26,50]]);if(i===9)return 'M5 24 Q5 5 24 5 H76 Q95 5 95 24 Q80 32 95 40 V60 Q80 68 95 76 Q95 95 76 95 H24 Q5 95 5 76 Q20 68 5 60 V40 Q20 32 5 24 Z';if(i===10)return polygon(star(20,46,40));if(i===11)return polygon(star(16,46,34));if(i===13)return 'M2 40 Q25 10 50 40 T98 40 V62 Q75 92 50 62 T2 62 Z';if(i===14)return 'M40 2 H60 V40 H98 V60 H60 V98 H40 V60 H2 V40 H40 Z';if(i===15)return 'M50 5 A30 30 0 0 1 80 35 A30 30 0 0 1 50 65 A30 30 0 0 1 20 35 A30 30 0 0 1 50 5 Z M50 35 A30 30 0 0 1 80 65 A30 30 0 0 1 50 95 A30 30 0 0 1 20 65 A30 30 0 0 1 50 35 Z';if(i===16)return 'M35 8 A27 27 0 0 1 62 35 A27 27 0 0 1 35 62 A27 27 0 0 1 8 35 A27 27 0 0 1 35 8 Z M65 38 A27 27 0 0 1 92 65 A27 27 0 0 1 65 92 A27 27 0 0 1 38 65 A27 27 0 0 1 65 38 Z';if(i===17)return 'M30 4 H70 V30 H96 V70 H70 V96 H30 V70 H4 V30 H30 Z';if(i===18)return 'M5 5 H95 V25 L78 25 L78 78 L95 78 V95 H5 V78 H22 V25 H5 Z';return polygon(patterns[i%patterns.length] as [number, number][])
}

/** Public path API: normalize the initial move command for consistent SVG output. */
export function getShapeCutPath(shapeId:string):string {
 const path = getShapeCutPathRaw(shapeId)
 return path.replace(/^M(?=\S)/, 'M ')
}

export function searchShapeCutShapes(query:string):ShapeCutTemplate[] { const q=query.trim().toLowerCase(); if(!q)return SHAPECUT_SHAPES; const aliases:Record<string,string[]>={heart:['double heart'],star:['spark','sun symbol','burst'],circle:['oval','ellipse','round'],arch:['gothic arch','pointed arch','rounded arch'],flower:['daisy','petal','rose','sunflower'],speech:['bubble','comic'],frame:['arch','polaroid','film','stamp']}; return SHAPECUT_SHAPES.filter(s=>s.name.toLowerCase().includes(q)||s.category.toLowerCase().includes(q)||(aliases[q]||[]).some(a=>s.name.toLowerCase().includes(a))) }
