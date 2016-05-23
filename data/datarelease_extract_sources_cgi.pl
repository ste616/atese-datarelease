#!/usr/bin/perl

use JSON;
use strict;

# Compile all the data for the specified sources and return a JSON structure for them.

# The base directory to find the data in.
my $od = $ARGV[0];

# The list of sources should be the rest of the arguments.
my @sources;
for (my $i = 1; $i <= $#ARGV; $i++) {
    push @sources, $ARGV[$i];
}

print "Reading catalogue...\n";
my $json = JSON->new;
my $catalogue;
my $catname = $od."/datarelease_catalogue.json";

if (-e $catname) {
    open(C, $catname);
    my $cattxt = <C>;
    close(C);
    $catalogue = from_json $cattxt;
} else {
    die "Can't open file $catname\n";
}

my $outh = {};

for (my $i = 0; $i <= $#sources; $i++) {
    if (exists $catalogue->{$sources[$i]}) {
	$outh->{$sources[$i]} = $catalogue->{$sources[$i]};
	$outh->{$sources[$i]}->{'data'} = [];
	# Grab the full data.
	for (my $j = 0; $j <= $#{$catalogue->{$sources[$i]}->{'epochs'}}; $j++) {
	    my $ename = $catalogue->{$sources[$i]}->{'epochs'}->[$j];
	    print "  epoch ".$ename."\n";
	    my $efile = $od."/".$ename."/".$sources[$i]."_".$ename.".json";
	    if (-e $efile) {
		open(D, $efile);
		my $datxt = <D>;
		close(D);
		push @{$outh->{$sources[$i]}->{'data'}}, from_json $datxt;
	    }
	}
    }
}

# Output the data.
chomp(my $fdate = `date -u +%Y-%m-%d_%H:%M:%S`);
my $outfile = "data_extract_".$fdate.".json";
open(O, ">".$outfile);
print O to_json $outh;
close(O);

print "Output created in file $outfile\n";

