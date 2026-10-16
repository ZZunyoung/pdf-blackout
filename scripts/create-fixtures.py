import io, os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw
os.makedirs('tests/tmp', exist_ok=True)
pdfmetrics.registerFont(UnicodeCIDFont('HYSMyeongJo-Medium'))
c=canvas.Canvas('dist/sample.pdf',pagesize=(595,842))
c.setTitle('BLACKOUT 샘플 문서')
c.setFillColorRGB(.97,.98,.95); c.rect(0,0,595,842,fill=1,stroke=0)
c.setFillColorRGB(.12,.17,.1);c.setFont('Helvetica-Bold',11);c.drawString(45,793,'BLACKOUT / SAMPLE DOCUMENT')
c.setStrokeColorRGB(.78,.83,.71);c.line(45,773,550,773)
c.setFont('HYSMyeongJo-Medium',26);c.drawString(45,715,'공유용 문서 검토')
c.setFont('HYSMyeongJo-Medium',11);c.setFillColorRGB(.45,.51,.38)
c.drawString(45,680,'이 문서는 기능 체험을 위한 가상 데이터입니다.')
c.drawString(45,661,'아래 정보나 이미지를 드래그해 삭제해 보세요.')
c.setFillColorRGB(1,1,1);c.roundRect(45,450,505,165,8,fill=1,stroke=0)
c.setFillColorRGB(.27,.36,.2);c.setFont('HYSMyeongJo-Medium',12)
c.drawString(67,583,'담당자 정보')
c.setFont('HYSMyeongJo-Medium',11);c.drawString(67,550,'이름: 홍길동 (가상 인물)')
c.setFont('Helvetica',11);c.drawString(67,523,'Email: sample@example.com')
c.drawString(67,496,'Phone: 010-0000-0000')
c.setFont('HYSMyeongJo-Medium',12);c.drawString(45,407,'이미지 영역도 함께 삭제할 수 있습니다.')
im=Image.new('RGB',(950,290),'#e2eacb');d=ImageDraw.Draw(im)
for x,col in [(25,'#748d57'),(340,'#b2c58c'),(655,'#59733f')]:
 d.rounded_rectangle((x,25,x+270,265),20,fill=col)
d.text((65,135),'IMAGE 01',fill='white');d.text((380,135),'IMAGE 02',fill='#314323');d.text((695,135),'IMAGE 03',fill='white')
b=io.BytesIO();im.save(b,format='PNG');b.seek(0)
c.drawImage(ImageReader(b),45,220,width=505,height=154)
c.setFont('HYSMyeongJo-Medium',10);c.setFillColorRGB(.49,.56,.41)
c.drawString(45,172,'1. 드래그로 선택   2. 삭제 내용 확인   3. PDF 저장')
c.setFont('Helvetica',9);c.drawString(45,45,'SAMPLE DATA ONLY');c.drawRightString(550,45,'01 / 02');c.showPage()
c.setFillColorRGB(.97,.98,.95);c.rect(0,0,595,842,fill=1,stroke=0)
c.setFillColorRGB(.12,.17,.1);c.setFont('Helvetica-Bold',11);c.drawString(45,793,'BLACKOUT / SECOND PAGE')
c.setFont('HYSMyeongJo-Medium',25);c.drawString(45,715,'여러 페이지도 한 번에')
c.setFont('HYSMyeongJo-Medium',12);c.drawString(45,667,'페이지를 이동해 여러 영역을 선택할 수 있습니다.')
c.drawString(45,638,'최종 저장 전까지 목록에서 선택을 취소할 수 있습니다.')
c.setFont('Helvetica',14);c.drawString(45,570,'Reference: INTERNAL-2026-001')
c.setFont('HYSMyeongJo-Medium',11);c.drawString(45,515,'안전 저장은 전체 문서를 이미지 PDF로 재구성합니다.')
c.drawString(45,491,'글자 검색이 필요하면 텍스트 유지 방식으로 저장하세요.')
c.setFont('Helvetica',9);c.drawString(45,45,'SAMPLE DATA ONLY');c.drawRightString(550,45,'02 / 02');c.save()
# A lossless image shared by two pages, plus selectable text and a rotated page.
im=Image.new('RGB',(200,100),'#ec3224');d=ImageDraw.Draw(im);d.rectangle((100,0,199,99),fill='#2a70d2')
im.save('tests/tmp/shared.png')
c=canvas.Canvas('tests/tmp/fixture.pdf',pagesize=(400,500))
for idx in range(2):
 c.setFont('Helvetica',16);c.drawString(40,450,'SECRET-12345');c.drawString(40,400,'KEEP-ME')
 c.drawImage('tests/tmp/shared.png',40,200,width=200,height=100)
 c.showPage()
c.save()

from pypdf import PdfReader,PdfWriter
r=PdfReader('tests/tmp/fixture.pdf');w=PdfWriter();w.append(r);w.pages[1].rotate(90)
with open('tests/tmp/fixture.pdf','wb') as f:w.write(f)
