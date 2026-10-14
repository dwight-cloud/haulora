/** State oversize/overweight (OS/OW) permit directory. Static public info. */

export interface StatePermitInfo {
  state: string;
  name: string;
  phone?: string;
  website: string;
  onlineSystem?: string;
  notes?: string;
}

export const PERMIT_DIRECTORY: StatePermitInfo[] = [
  { state: "AL", name: "Alabama DOT", phone: "334-834-1092", website: "https://alabamatrucking.org/permits", onlineSystem: "https://emp.alabama.gov" },
  { state: "AK", name: "Alaska DOT&PF", phone: "907-365-1200", website: "https://dot.alaska.gov/mscve/permits.shtml" },
  { state: "AZ", name: "ADOT Commercial Permits", phone: "602-712-8851", website: "https://azdot.gov/motor-vehicles/commercial", onlineSystem: "https://eservices.azdot.gov" },
  { state: "AR", name: "Arkansas HP - OS/OW", phone: "501-569-2381", website: "https://www.ardot.gov/divisions/permits/" },
  { state: "CA", name: "Caltrans Transportation Permits", phone: "916-322-1297", website: "https://dot.ca.gov/programs/traffic-operations/trucks/transportation-permits", onlineSystem: "https://www.dot.ca.gov/trucks" },
  { state: "CO", name: "CDOT Permit Office", phone: "303-757-9539", website: "https://www.codot.gov/business/permits" },
  { state: "CT", name: "CT DOT Oversize Permits", phone: "860-594-2880", website: "https://portal.ct.gov/DOT/Permits" },
  { state: "DE", name: "DelDOT Hauling Permits", phone: "302-744-2700", website: "https://deldot.gov/Business/permits" },
  { state: "FL", name: "FDOT Motor Carrier Size & Weight", phone: "850-410-5777", website: "https://www.fdot.gov/permits/" },
  { state: "GA", name: "GDOT Permit Office", phone: "404-635-8176", website: "https://www.dot.ga.gov/GDOT/Pages/Permits.aspx" },
  { state: "HI", name: "Hawaii DOT Highways", phone: "808-587-1844", website: "https://hidot.hawaii.gov/highways/oversize-permits/" },
  { state: "ID", name: "Idaho Transportation Dept", phone: "208-334-8420", website: "https://itd.idaho.gov/permits" },
  { state: "IL", name: "Illinois DOT Permits", phone: "217-785-1477", website: "https://idot.illinois.gov/transportation-system/permits" },
  { state: "IN", name: "INDOT OS/OW Permits", phone: "317-615-7320", website: "https://www.in.gov/indot/oversize-overweight-permitting/" },
  { state: "IA", name: "Iowa DOT MVE", phone: "515-237-3264", website: "https://iowadot.gov/mvd/motorcarriers/permits" },
  { state: "KS", name: "KDOT Truck Routing", phone: "785-296-7400", website: "https://www.ksdot.gov/bureaus/burtrafficeng/routingpermits" },
  { state: "KY", name: "KYTC Div of Motor Carriers", phone: "502-564-1257", website: "https://drive.ky.gov/motor-carriers" },
  { state: "LA", name: "LADOTD Truck Permits", phone: "225-343-2345", website: "https://wwwsp.dotd.la.gov/Inside_LaDOTD/Divisions/Multimodal/Weights_and_Standards" },
  { state: "ME", name: "Maine DOT OS/OW", phone: "207-624-3263", website: "https://www.maine.gov/mdot/permits/" },
  { state: "MD", name: "Maryland SHA Hauling Permits", phone: "410-582-5734", website: "https://www.roads.maryland.gov/ohd2/" },
  { state: "MA", name: "MassDOT Permits", phone: "857-368-6040", website: "https://www.mass.gov/permits-for-oversize-and-overweight-loads" },
  { state: "MI", name: "MDOT OS/OW Section", phone: "517-241-8999", website: "https://www.michigan.gov/mdot/business/permits" },
  { state: "MN", name: "MnDOT OS/OW Permits", phone: "651-296-6000", website: "https://www.dot.state.mn.us/cvo/oversize/" },
  { state: "MS", name: "MDOT OS/OW Permits", phone: "601-359-1717", website: "https://mdot.ms.gov/permits/" },
  { state: "MO", name: "MoDOT Motor Carrier Services", phone: "866-831-6277", website: "https://www.modot.org/motor-carrier-services" },
  { state: "MT", name: "Montana MCS", phone: "406-444-6130", website: "https://www.mdt.mt.gov/business/mcs/" },
  { state: "NE", name: "Nebraska DOT Permits", phone: "402-471-0034", website: "https://dot.nebraska.gov/business-center/dot-permits/" },
  { state: "NV", name: "Nevada DOT OS/OW", phone: "775-888-7410", website: "https://www.dot.nv.gov/doing-business/about-ndot/ndot-divisions/administrative-services/permits" },
  { state: "NH", name: "NH DOT Turnpikes Permits", phone: "603-271-2691", website: "https://www.dot.nh.gov/permits" },
  { state: "NJ", name: "NJDOT Truck Permits", phone: "609-530-2898", website: "https://www.state.nj.us/transportation/freight/trucking/permits.shtm" },
  { state: "NM", name: "NM Motor Transportation", phone: "505-476-3950", website: "https://www.tax.newmexico.gov/businesses/mvd-motor-carrier/" },
  { state: "NY", name: "NYSDOT OS/OW", phone: "518-457-1155", website: "https://www.dot.ny.gov/permits" },
  { state: "NC", name: "NCDOT OS/OW", phone: "919-814-3700", website: "https://connect.ncdot.gov/business/trucking/Pages/Permits.aspx" },
  { state: "ND", name: "ND DOT MCS", phone: "701-328-2621", website: "https://www.dot.nd.gov/divisions/mv/permits.htm" },
  { state: "OH", name: "ODOT OS/OW", phone: "614-351-2300", website: "https://www.transportation.ohio.gov/working/permits/" },
  { state: "OK", name: "Oklahoma DPS OS/OW", phone: "405-425-2390", website: "https://oklahoma.gov/dps/oversize-overweight-permits.html" },
  { state: "OR", name: "ODOT Motor Carrier", phone: "503-378-6699", website: "https://www.oregon.gov/odot/MCT" },
  { state: "PA", name: "PennDOT Permits", phone: "717-787-5196", website: "https://www.penndot.pa.gov/ProjectAndPrograms/Trucking/" },
  { state: "RI", name: "RIDOT Permits", phone: "401-222-2023", website: "https://www.dot.ri.gov/travel/permits" },
  { state: "SC", name: "SCDOT OS/OW", phone: "803-737-6825", website: "https://www.scdot.org/business/oversize-overweight.aspx" },
  { state: "SD", name: "SD DOT Permits", phone: "605-773-4578", website: "https://dot.sd.gov/doing-business/permits" },
  { state: "TN", name: "TDOT OS/OW", phone: "615-741-3821", website: "https://www.tn.gov/tdot/trucking/permits.html" },
  { state: "TX", name: "TxDMV OS/OW", phone: "800-299-1700", website: "https://www.txdmv.gov/motor-carriers/oversize-overweight-permits" },
  { state: "UT", name: "UDOT Motor Carrier", phone: "801-965-4892", website: "https://www.udot.utah.gov/connect/business/permits/" },
  { state: "VT", name: "VTrans OS/OW", phone: "802-828-2064", website: "https://vtrans.vermont.gov/permits" },
  { state: "VA", name: "VDOT Hauling Permits", phone: "804-786-2787", website: "https://www.vdot.virginia.gov/business/permits-hauling-main.asp" },
  { state: "WA", name: "WSDOT CVS", phone: "360-704-6340", website: "https://www.wsdot.wa.gov/CommercialVehicle" },
  { state: "WV", name: "WV DOT Permits", phone: "304-926-0799", website: "https://transportation.wv.gov/highways/motor-carriers" },
  { state: "WI", name: "WisDOT OS/OW", phone: "608-266-7320", website: "https://wisconsindot.gov/Pages/dmv/com-drv-vehs/mtr-car-trkr/osow/default.aspx" },
  { state: "WY", name: "WYDOT Motor Carrier", phone: "307-777-4376", website: "https://www.dot.state.wy.us/home/motor_carrier.html" },
  { state: "DC", name: "DDOT OS/OW", phone: "202-671-2700", website: "https://ddot.dc.gov/page/oversize-overweight-permits" },
];
