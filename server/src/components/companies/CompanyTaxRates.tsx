import React from 'react';
import { Button } from '@radix-ui/themes';
import { ITaxRate, ICompanyTaxRate } from '@/interfaces/billing.interfaces';
import { DataTable } from '../ui/DataTable';
import { ColumnDefinition } from '@/interfaces/dataTable.interfaces';
import CustomSelect from '@/components/ui/CustomSelect';

interface CompanyTaxRatesProps {
    companyTaxRates: ICompanyTaxRate[];
    taxRates: ITaxRate[];
    selectedTaxRate: string;
    onSelectTaxRate: (value: string) => void;
    onAdd: () => void;
    onRemove: (taxRateId: string) => void;
}

interface TaxRateTableData {
    company_tax_rate_id: string;
    tax_rate_id: string;
    region: string;
    tax_percentage: number;
    description: string;
}

const CompanyTaxRates: React.FC<CompanyTaxRatesProps> = ({
    companyTaxRates,
    taxRates,
    selectedTaxRate,
    onSelectTaxRate,
    onAdd,
    onRemove
}) => {
    // Transform data for the table, ensuring all required fields are present
    const tableData: TaxRateTableData[] = companyTaxRates
        .filter(companyTaxRate => companyTaxRate.company_tax_rate_id) // Filter out any entries without an ID
        .map((companyTaxRate): TaxRateTableData => {
            const taxRate = taxRates.find(tr => tr.tax_rate_id === companyTaxRate.tax_rate_id);
            return {
                company_tax_rate_id: companyTaxRate.company_tax_rate_id!,
                tax_rate_id: companyTaxRate.tax_rate_id,
                region: taxRate?.region || '',
                tax_percentage: taxRate?.tax_percentage || 0,
                description: taxRate?.description || ''
            };
        });

    const columns: ColumnDefinition<TaxRateTableData>[] = [
        {
            title: 'Region',
            dataIndex: 'region'
        },
        {
            title: 'Tax Percentage',
            dataIndex: 'tax_percentage',
            render: (value) => `${value}%`
        },
        {
            title: 'Description',
            dataIndex: 'description'
        },
        {
            title: 'Actions',
            dataIndex: 'tax_rate_id',
            render: (_, record) => (
                <Button 
                    variant="soft" 
                    size="1" 
                    color="red" 
                    onClick={() => onRemove(record.tax_rate_id)}
                >
                    Remove
                </Button>
            )
        }
    ];

    const taxRateOptions = taxRates.map((taxRate) => ({
        value: taxRate.tax_rate_id!,
        label: `${taxRate.region} - ${taxRate.tax_percentage}%`
    }));

    return (
        <div className="space-y-4">
            <h3 className="font-semibold">Company Tax Rates</h3>
            
            <DataTable
                data={tableData}
                columns={columns}
                pagination={false}
            />

            <div className="flex items-center gap-2 mt-4">
                <div className="flex-1">
                    <CustomSelect
                        value={selectedTaxRate}
                        onValueChange={onSelectTaxRate}
                        options={taxRateOptions}
                        placeholder="Select Tax Rate"
                    />
                </div>
                <Button 
                    onClick={onAdd}
                    className="bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap px-4"
                >
                    Add Tax Rate
                </Button>
            </div>
        </div>
    );
};

export default CompanyTaxRates;
