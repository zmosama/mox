/**
 * One-off: keep the people named in every full title record already in the
 * catalogue. Records saved from now on keep their people as they are saved.
 *
 *   tsx scripts/catalog-people.mts
 */
import { catalogSize, peopleFromRecords } from "../src/lib/catalog";

const before = catalogSize().people;
const seen = peopleFromRecords();
console.log(`${seen} credits read, people ${before} -> ${catalogSize().people}`);
