const fs = require('fs');
const xml2js = require('xml2js');

const parser = new xml2js.Parser();

fs.readFile('resultHeadless.xml', (err, data) => {
    if (err) throw err;
    parser.parseString(data, (err, result) => {
        if (err) throw err;

        // Extract master_config
        const masterConfig = result.map_response.master_config[0];
        const sectionConfig = masterConfig.section_config[0].section || [];
        const sectionInventory = masterConfig.section_inventory[0].section || [];
        const priceStructure = result.map_response.price_structure[0].pricescale || [];

        // Create a map for price id to price
        const priceMap = {};
        priceStructure.forEach(scale => {
            priceMap[scale.$.id] = scale.$.ref_price;
        });

        // Create a map for section id to available amount and price scale ids
        const inventoryMap = {};
        sectionInventory.forEach(section => {
            const pricescales = (section.pricescale || []).map(ps => ({
                id: ps.$.id,
                available: ps.$.available
            }));
            inventoryMap[section.$.id] = pricescales;
        });

        // Extract and display required data
        const resultData = sectionConfig.map(section => {
            const id = section.$.id;
            const name = section.$.section_public_code;
            const inventory = inventoryMap[id] || [];

            const prices = inventory.map(inv => ({
                price: priceMap[inv.id],
                available: inv.available
            }));

            return {
                id,
                name,
                prices
            };
        });

        // Write the result to result.json
        fs.writeFile('result.json', JSON.stringify(resultData, null, 2), err => {
            if (err) throw err;
            console.log('Data has been written to result.json');
        });
    });
});
