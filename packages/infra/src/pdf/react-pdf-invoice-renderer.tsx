import { type InvoicePdfData, type InvoicePdfRenderer } from '@cashpilot/application';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

// The built-in Helvetica has no glyph for narrow no-break spaces: use plain spaces in the PDF.
const plain = (s: string) => s.replace(/[  ]/g, ' ');
const money = (millimes: number) =>
  plain(new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(millimes / 1000)) + ' DT';
const date = (iso: string) =>
  plain(new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)));
const qty = (hundredths: number) => plain(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(hundredths / 100));
const rate = (bp: number) => `${bp / 100} %`;

const ink = '#1f2937';
const muted = '#6b7280';
const border = '#e5e7eb';
const primary = '#2f4fa6';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: ink },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  company: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: primary },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  muted: { color: muted },
  block: { marginBottom: 18 },
  label: { fontSize: 8, color: muted, textTransform: 'uppercase', marginBottom: 3 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderColor: ink, paddingBottom: 4, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: border, paddingVertical: 5 },
  cDesc: { flex: 4 },
  cQty: { flex: 1, textAlign: 'right' },
  cUnit: { flex: 1.6, textAlign: 'right' },
  cVat: { flex: 1, textAlign: 'right' },
  cHt: { flex: 1.6, textAlign: 'right' },
  totals: { marginTop: 14, marginLeft: 'auto', width: 230 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: ink, marginTop: 4, paddingTop: 4, fontFamily: 'Helvetica-Bold', fontSize: 12 },
  watermark: {
    position: 'absolute',
    top: 330,
    left: 70,
    fontSize: 90,
    color: '#dc2626',
    opacity: 0.18,
    transform: 'rotate(-30deg)',
    fontFamily: 'Helvetica-Bold',
  },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: muted, textAlign: 'center' },
});

function InvoiceDocument({ d }: { d: InvoicePdfData }) {
  const cancelled = d.status === 'CANCELLED';
  return (
    <Document title={d.number} author={d.company.name}>
      <Page size="A4" style={styles.page}>
        {cancelled && <Text style={styles.watermark}>ANNULÉE</Text>}
        <View style={styles.header}>
          <View>
            <Text style={styles.company}>{d.company.name}</Text>
          </View>
          <View>
            <Text style={styles.title}>Facture</Text>
            <Text style={{ textAlign: 'right' }}>{d.number}</Text>
            <Text style={[styles.muted, { textAlign: 'right' }]}>Émise le {date(d.issueDate)}</Text>
            <Text style={[styles.muted, { textAlign: 'right' }]}>Échéance {date(d.dueDate)}</Text>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Facturé à</Text>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{d.client.name}</Text>
          {d.client.address ? <Text>{d.client.address}</Text> : null}
          {d.client.taxId ? <Text>MF : {d.client.taxId}</Text> : null}
          {d.client.email ? <Text style={styles.muted}>{d.client.email}</Text> : null}
        </View>

        <View style={styles.tableHead}>
          <Text style={styles.cDesc}>Désignation</Text>
          <Text style={styles.cQty}>Qté</Text>
          <Text style={styles.cUnit}>PU HT</Text>
          <Text style={styles.cVat}>TVA</Text>
          <Text style={styles.cHt}>Total HT</Text>
        </View>
        {d.lines.map((l, i) => (
          <View style={styles.row} key={i} wrap={false}>
            <Text style={styles.cDesc}>{l.description}</Text>
            <Text style={styles.cQty}>{qty(l.qtyHundredths)}</Text>
            <Text style={styles.cUnit}>{money(l.unitMillimes)}</Text>
            <Text style={styles.cVat}>{rate(l.vatRateBp)}</Text>
            <Text style={styles.cHt}>{money(l.htMillimes)}</Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Total HT</Text>
            <Text>{money(d.htMillimes)}</Text>
          </View>
          {d.vatByRate.map((v) => (
            <View style={styles.totalRow} key={v.rateBp}>
              <Text>TVA {rate(v.rateBp)} sur {money(v.baseMillimes)}</Text>
              <Text>{money(v.vatMillimes)}</Text>
            </View>
          ))}
          {d.stampDutyMillimes > 0 && (
            <View style={styles.totalRow}>
              <Text>Timbre fiscal</Text>
              <Text>{money(d.stampDutyMillimes)}</Text>
            </View>
          )}
          <View style={styles.grand}>
            <Text>Total TTC</Text>
            <Text>{money(d.totalMillimes)}</Text>
          </View>
          {!cancelled && (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.muted}>Déjà réglé</Text>
                <Text style={styles.muted}>{money(d.paidMillimes)}</Text>
              </View>
              <View style={[styles.totalRow, { fontFamily: 'Helvetica-Bold' }]}>
                <Text>Reste à payer</Text>
                <Text>{money(d.remainingMillimes)}</Text>
              </View>
            </>
          )}
        </View>

        {cancelled && d.cancelReason ? (
          <View style={[styles.block, { marginTop: 18 }]}>
            <Text style={styles.label}>Motif d’annulation</Text>
            <Text>{d.cancelReason}</Text>
          </View>
        ) : null}
        {d.notes ? (
          <View style={[styles.block, { marginTop: 18 }]}>
            <Text style={styles.label}>Notes</Text>
            <Text>{d.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          {d.company.name} — {d.number} — document généré par CashPilot
        </Text>
      </Page>
    </Document>
  );
}

export class ReactPdfInvoiceRenderer implements InvoicePdfRenderer {
  async render(data: InvoicePdfData): Promise<Uint8Array> {
    const buffer = await renderToBuffer(<InvoiceDocument d={data} />);
    return new Uint8Array(buffer);
  }
}
